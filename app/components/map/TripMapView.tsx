'use client'
// Interactive 3D globe view of a trip — an alternative to the timeline,
// not a replacement (the timeline page is untouched and one click away).
//
// Free and keyless throughout:
// - MapLibre GL JS (open source, BSD-3) renders a globe, like Google Earth.
//   Google Earth/Maps itself needs a billing account, so it isn't used.
// - Map tiles: OpenFreeMap (free, no key). Satellite: EOX Sentinel-2
//   cloudless 2017, the newest year licensed CC BY 4.0 (later years are
//   NonCommercial). Both are free public services with no SLA.
// - Places without an airport code are geocoded with OpenStreetMap
//   Nominatim; landmarks come from Wikipedia (see ./placeLookup.ts).
// - Live location is the browser's own Geolocation API, strictly opt-in,
//   kept in this tab (./useLiveLocation.ts).
//
// The boarding pass at the bottom is the real BoardingPass component, so
// every action (report a delay, approve a contact, confirm a reschedule)
// works here exactly as on the timeline.
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DndContext } from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import { List, LocateFixed, LocateOff, Navigation, ChevronDown, ChevronUp, Landmark as LandmarkIcon } from 'lucide-react'
import type { Map as MLMap, Marker as MLMarker, StyleSpecification, GeoJSONSource } from 'maplibre-gl'
import BoardingPass from '../BoardingPass'
import { TransportTypeIcon } from '../transportIcons'
import { getFieldProfile } from '../segmentFieldProfiles'
import { lookupAirport } from '@/lib/data/airports'
import { displaySegmentLabel } from '@/lib/segmentLabel'
import { formatFriendlyTime, formatDuration, resolveSegmentZones } from '@/lib/dateFormat'
import { proximityReport, routeLine, haversineKm, formatDistance, scheduleProgress, type LatLng, type MapSegment } from '@/lib/map/geo'
import { geocodePlace, nearbyLandmarks, type Landmark } from './placeLookup'
import { useLiveLocation } from './useLiveLocation'
import type { SegmentDTO, TripDTO } from '../types'
import styles from '../../styles/tripMap.module.css'

type BaseStyle = 'map' | 'satellite'
const STYLE_PREF_KEY = 'maestravl:mapStyle'
const REFRESH_MS = 10_000

const VECTOR_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const SATELLITE_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    satellite: {
      type: 'raster',
      tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2017_3857/default/g/{z}/{y}/{x}.jpg'],
      tileSize: 256,
      maxzoom: 14,
      attribution:
        '<a href="https://s2maps.eu" target="_blank" rel="noopener">Sentinel-2 cloudless – s2maps.eu</a> by <a href="https://eox.at" target="_blank" rel="noopener">EOX IT Services GmbH</a> (Contains modified Copernicus Sentinel data 2017)',
    },
  },
  layers: [{ id: 'satellite', type: 'raster', source: 'satellite' }],
}
const styleFor = (s: BaseStyle) => (s === 'satellite' ? SATELLITE_STYLE : VECTOR_STYLE_URL)

const STATUS_COLOR: Record<string, string> = { DELAYED: '#e0aa4e', CANCELLED: '#e88a7d' }
const statusColor = (status: string) => STATUS_COLOR[status] ?? '#8fc180'

interface Endpoints {
  from: LatLng | null
  to: LatLng | null
  fromQuery: string | null
  toQuery: string | null
}

/** Airport codes resolve instantly from the bundled table; anything else needs geocoding. */
function endpointsFor(s: SegmentDTO, geocoded: Record<string, LatLng | null>): Endpoints {
  const hasRoute = getFieldProfile(s.transportType).hasRoute
  const depAirport = s.departureLocationCode ? lookupAirport(s.departureLocationCode) : null
  const arrAirport = hasRoute && s.arrivalLocationCode ? lookupAirport(s.arrivalLocationCode) : null
  const fromQuery = depAirport ? null : s.departureLocation?.trim() || null
  const toQuery = !hasRoute || arrAirport ? null : s.arrivalLocation?.trim() || null
  return {
    from: depAirport ? { lat: depAirport.lat, lng: depAirport.lng } : fromQuery ? geocoded[fromQuery] ?? null : null,
    to: arrAirport ? { lat: arrAirport.lat, lng: arrAirport.lng } : toQuery ? geocoded[toQuery] ?? null : null,
    fromQuery,
    toQuery,
  }
}

const pointKey = (p: LatLng) => `${p.lat.toFixed(3)},${p.lng.toFixed(3)}`

export default function TripMapView({ trip, homeTimezone }: { trip: TripDTO; homeTimezone: string | null }) {
  const router = useRouter()
  const containerRef = useRef<HTMLDivElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  const sheetRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const mlRef = useRef<typeof import('maplibre-gl') | null>(null)
  const markersRef = useRef(new Map<string, MLMarker>())
  /** Which set of places the camera was last framed on. */
  const framedKeyRef = useRef('')
  /** The user has panned/zoomed or picked a segment — stop auto-framing. */
  const userMovedRef = useRef(false)
  const userPickedRef = useRef(false)

  const [ready, setReady] = useState(false)
  const [styleVersion, setStyleVersion] = useState(0)
  const [mapError, setMapError] = useState<string | null>(null)
  const [baseStyle, setBaseStyle] = useState<BaseStyle>('map')
  const [headerBottom, setHeaderBottom] = useState(72)
  const [sheetHeight, setSheetHeight] = useState(0)
  const [sheetOpen, setSheetOpen] = useState(true)
  const [insightsOpen, setInsightsOpen] = useState(true)
  const [selectedId, setSelectedId] = useState<string | null>(trip.segments[0]?.id ?? null)
  const [geocoded, setGeocoded] = useState<Record<string, LatLng | null>>({})
  const [now, setNow] = useState<Date | null>(null)
  const [markerSlots, setMarkerSlots] = useState<{ key: string; el: HTMLElement }[]>([])
  const [landmarks, setLandmarks] = useState<{ key: string; items: Landmark[]; error: string | null; loading: boolean } | null>(null)
  const live = useLiveLocation()

  const segments = trip.segments
  const selected = segments.find((s) => s.id === selectedId) ?? segments[0] ?? null

  // ---- client-only clock, header measurement, saved style, polling -----
  useEffect(() => {
    setNow(new Date())
    const t = setInterval(() => setNow(new Date()), 30_000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    const measure = () => setHeaderBottom(Math.round(document.querySelector('header')?.getBoundingClientRect().bottom ?? 72))
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  // Phones: start with "Right now" collapsed so the globe isn't covered.
  useEffect(() => {
    if (window.matchMedia('(max-width: 700px)').matches) setInsightsOpen(false)
  }, [])

  useEffect(() => {
    try {
      if (localStorage.getItem(STYLE_PREF_KEY) === 'satellite') setBaseStyle('satellite')
    } catch {
      /* default style */
    }
  }, [])

  // Statuses, recovery runs and approvals stay as live as on the timeline.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh()
    }, REFRESH_MS)
    return () => clearInterval(t)
  }, [router])

  useEffect(() => {
    if (!sheetRef.current) return
    const ro = new ResizeObserver(([entry]) => setSheetHeight(Math.round(entry.contentRect.height)))
    ro.observe(sheetRef.current)
    return () => ro.disconnect()
  }, [])

  // ---- geometry --------------------------------------------------------
  const endpoints = useMemo(() => new Map(segments.map((s) => [s.id, endpointsFor(s, geocoded)])), [segments, geocoded])

  // Geocode each unresolved place once (queued + cached in placeLookup.ts).
  useEffect(() => {
    const queries = new Set<string>()
    for (const e of endpoints.values()) for (const q of [e.fromQuery, e.toQuery]) if (q && !(q in geocoded)) queries.add(q)
    for (const q of queries) {
      geocodePlace(q).then((p) => setGeocoded((prev) => (q in prev ? prev : { ...prev, [q]: p })))
    }
  }, [endpoints, geocoded])

  const mapSegments: MapSegment[] = useMemo(
    () =>
      segments.map((s) => ({
        id: s.id,
        label: displaySegmentLabel(s),
        transportType: s.transportType,
        status: s.status,
        departureTime: s.departureTime ? new Date(s.departureTime) : null,
        arrivalTime: s.arrivalTime ? new Date(s.arrivalTime) : null,
        from: endpoints.get(s.id)?.from ?? null,
        to: endpoints.get(s.id)?.to ?? null,
      })),
    [segments, endpoints]
  )

  const report = useMemo(() => (now ? proximityReport(mapSegments, live.position, now) : null), [mapSegments, live.position, now])

  // Open on whatever matters now — the leg underway, else the next one —
  // unless the passenger has already picked something.
  useEffect(() => {
    if (!now || userPickedRef.current) return
    const upcoming = mapSegments
      .filter((s) => s.departureTime && s.departureTime > now)
      .sort((a, b) => a.departureTime!.getTime() - b.departureTime!.getTime())[0]
    const target = report?.current?.segmentId ?? upcoming?.id
    if (target) setSelectedId(target)
  }, [now, report, mapSegments])

  const unplaced = segments.filter((s) => {
    const e = endpoints.get(s.id)!
    const pending = (e.fromQuery && !(e.fromQuery in geocoded)) || (e.toQuery && !(e.toQuery in geocoded))
    return !pending && !e.from
  })

  // ---- map lifecycle ---------------------------------------------------
  useEffect(() => {
    let cancelled = false
    let map: MLMap | null = null
    import('maplibre-gl')
      .then((ml) => {
        if (cancelled || !containerRef.current) return
        mlRef.current = ml
        // MapLibre can't find its own worker once bundled — serve it from our
        // origin (scripts/copy-vendor-assets.mjs, run on install).
        ml.setWorkerUrl(`/vendor/maplibre-gl-worker-${ml.getVersion()}.mjs`)
        try {
          map = new ml.Map({
            container: containerRef.current,
            style: styleFor('map'),
            center: [-50, 25],
            zoom: 1.6,
            attributionControl: { compact: true },
          })
        } catch {
          setMapError("Your browser couldn't start the 3D map (WebGL is unavailable or turned off). Your trip is still listed below.")
          return
        }
        map.addControl(new ml.NavigationControl({ visualizePitch: true }), 'bottom-left')

        // A drag/scroll/pinch by the user (these carry an originalEvent;
        // our own flyTo/fitBounds don't) — stop auto-framing from then on.
        map.on('movestart', (e) => {
          if ((e as { originalEvent?: unknown }).originalEvent) userMovedRef.current = true
        })

        // Never fail silently into a black screen: say what went wrong, and
        // log the technical reason (reported from production 2026-10-12 —
        // a black map with no explanation).
        let styleLoaded = false
        const fail = (message: string, detail: unknown) => {
          console.error('[map]', message, detail)
          setMapError(message)
        }
        map.on('error', (e) => {
          // Individual tiles fail now and then (aborted, offline briefly); only
          // a style that never loads is fatal — the watchdog below covers that.
          const detail = e as unknown as { error?: Error; sourceId?: string }
          console.warn('[map] error', detail.sourceId ?? '', detail.error?.message ?? e)
        })
        map.getCanvas().addEventListener('webglcontextlost', (e) => {
          fail("The map's graphics stopped working (the browser lost its WebGL context). Reload the page; if it keeps happening, check that hardware acceleration is on in your browser settings.", e)
        })
        const watchdog = window.setTimeout(() => {
          if (!styleLoaded) fail("The map's background couldn't load. It may be blocked by an ad or content blocker, a firewall, or a slow connection — your trip is still listed below.", 'style.load did not fire within 20s')
        }, 20_000)
        map.on('remove', () => window.clearTimeout(watchdog))

        map.on('style.load', () => {
          styleLoaded = true
          window.clearTimeout(watchdog)
          setMapError(null)
          map!.setProjection({ type: 'globe' })
          if (!map!.getSource('trip-routes')) {
            map!.addSource('trip-routes', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } })
            map!.addLayer({
              id: 'trip-routes-ground',
              type: 'line',
              source: 'trip-routes',
              filter: ['==', ['get', 'kind'], 'ground'],
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'selected'], 4, 2.5], 'line-dasharray': [1.5, 1.5], 'line-opacity': 0.9 },
            })
            map!.addLayer({
              id: 'trip-routes-air',
              type: 'line',
              source: 'trip-routes',
              filter: ['==', ['get', 'kind'], 'air'],
              layout: { 'line-cap': 'round', 'line-join': 'round' },
              paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'selected'], 4.5, 2.5], 'line-opacity': 0.95 },
            })
          }
          setStyleVersion((v) => v + 1)
        })
        mapRef.current = map
        // Development-only handle for e2e checks of map state (layers, sources).
        if (process.env.NODE_ENV !== 'production') (window as unknown as { __maestravlMap?: MLMap }).__maestravlMap = map
        setReady(true)
      })
      .catch((err) => {
        console.error('[map] failed to load the map library', err)
        setMapError("The map couldn't load. Check your connection and refresh — your trip is still listed below.")
      })
    return () => {
      cancelled = true
      markersRef.current.forEach((m) => m.remove())
      markersRef.current.clear()
      map?.remove()
      mapRef.current = null
    }
  }, [])

  // Base style switch (markers are DOM overlays and survive it; routes are re-added on style.load).
  const appliedStyleRef = useRef<BaseStyle>('map')
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map || appliedStyleRef.current === baseStyle) return
    appliedStyleRef.current = baseStyle
    map.setStyle(styleFor(baseStyle), { diff: false })
    try {
      localStorage.setItem(STYLE_PREF_KEY, baseStyle)
    } catch {
      /* not remembered — fine */
    }
  }, [ready, baseStyle])

  // Route lines.
  useEffect(() => {
    const source = mapRef.current?.getSource('trip-routes') as GeoJSONSource | undefined
    if (!source) return
    source.setData({
      type: 'FeatureCollection',
      features: mapSegments
        .filter((s) => s.from && s.to)
        .map((s) => ({
          type: 'Feature' as const,
          properties: { id: s.id, kind: s.transportType === 'FLIGHT' || s.transportType === 'HELICOPTER' ? 'air' : 'ground', color: statusColor(s.status), selected: s.id === selectedId },
          geometry: { type: 'LineString' as const, coordinates: routeLine(s.from!, s.to!, s.transportType === 'FLIGHT') },
        })),
    })
  }, [ready, styleVersion, mapSegments, selectedId])

  // Marker positions: trip places (grouped where segments share a place,
  // like a connecting airport), the estimated vehicle, the passenger, landmarks.
  const groups = useMemo(() => {
    const byKey = new Map<string, { point: LatLng; entries: { segmentId: string; role: 'from' | 'to' }[] }>()
    for (const s of mapSegments) {
      for (const role of ['from', 'to'] as const) {
        const p = s[role]
        if (!p) continue
        const key = `place:${pointKey(p)}`
        const g = byKey.get(key) ?? { point: p, entries: [] }
        g.entries.push({ segmentId: s.id, role })
        byKey.set(key, g)
      }
    }
    return byKey
  }, [mapSegments])

  const vehicle = report?.current?.estimatedPosition ? { point: report.current.estimatedPosition, segmentId: report.current.segmentId } : null
  const anchor: { point: LatLng; label: string } | null = live.position
    ? { point: live.position, label: 'you' }
    : selected && endpoints.get(selected.id)
      ? (() => {
          const e = endpoints.get(selected.id)!
          const p = e.to ?? e.from
          return p ? { point: p, label: displaySegmentLabel(selected) } : null
        })()
      : null

  useEffect(() => {
    const map = mapRef.current
    const ml = mlRef.current
    if (!ready || !map || !ml) return
    const desired = new Map<string, LatLng>()
    for (const [key, g] of groups) desired.set(key, g.point)
    if (vehicle) desired.set('vehicle', vehicle.point)
    if (live.position) desired.set('me', live.position)
    landmarks?.items.slice(0, 6).forEach((l, i) => desired.set(`landmark:${i}`, { lat: l.lat, lng: l.lng }))

    let changed = false
    for (const [key, marker] of markersRef.current) {
      if (!desired.has(key)) {
        marker.remove()
        markersRef.current.delete(key)
        changed = true
      }
    }
    for (const [key, p] of desired) {
      const existing = markersRef.current.get(key)
      if (existing) existing.setLngLat([p.lng, p.lat])
      else {
        const el = document.createElement('div')
        const marker = new ml.Marker({ element: el, anchor: 'center' }).setLngLat([p.lng, p.lat]).addTo(map)
        markersRef.current.set(key, marker)
        changed = true
      }
    }
    if (changed) setMarkerSlots([...markersRef.current].map(([key, m]) => ({ key, el: m.getElement() })))
  }, [ready, groups, vehicle?.point.lat, vehicle?.point.lng, live.position, landmarks]) // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Room left for the panels and the pass sheet — clamped to the canvas, so
   * on a short window the padding can never exceed the map itself (MapLibre
   * then refuses to fit at all: "Map cannot fit within canvas").
   */
  function framePadding(map: MLMap) {
    const { clientWidth: w, clientHeight: h } = map.getContainer()
    const want = { top: 90, bottom: sheetHeight + 40, left: 50, right: w > 900 ? 380 : 50 }
    const scaleV = Math.min(1, (h * 0.6) / (want.top + want.bottom))
    const scaleH = Math.min(1, (w * 0.6) / (want.left + want.right))
    return { top: want.top * scaleV, bottom: want.bottom * scaleV, left: want.left * scaleH, right: want.right * scaleH }
  }

  // Frame the trip, and re-frame as more of its places resolve — airport
  // codes resolve instantly but hotels, stations and unrecognised codes
  // (e.g. "NMIA") need an online lookup. Framing once on the first point
  // zoomed real trips onto one airport at street level, the rest off-screen
  // (found in production 2026-10-12). Stops once the user moves the map or
  // picks a segment, so it never fights them.
  const pendingLookups = [...endpoints.values()].some((e) => (e.fromQuery && !(e.fromQuery in geocoded)) || (e.toQuery && !(e.toQuery in geocoded)))
  useEffect(() => {
    const map = mapRef.current
    const ml = mlRef.current
    if (!ready || !map || !ml || userMovedRef.current || groups.size === 0) return
    const key = [...groups.keys()].sort().join('|')
    if (key === framedKeyRef.current) return
    const points = [...groups.values()].map((g) => g.point)
    // One place known but others still being looked up: wait, rather than
    // zoom into that one place and then have to jump back out.
    if (points.length === 1 && pendingLookups) return
    framedKeyRef.current = key
    if (points.length === 1) {
      map.flyTo({ center: [points[0].lng, points[0].lat], zoom: 11, duration: 1500 })
      return
    }
    const bounds = new ml.LngLatBounds()
    points.forEach((p) => bounds.extend([p.lng, p.lat]))
    map.fitBounds(bounds, { padding: framePadding(map), duration: 1500, maxZoom: 9 })
  }, [ready, groups, sheetHeight, pendingLookups]) // eslint-disable-line react-hooks/exhaustive-deps

  function select(segmentId: string) {
    userPickedRef.current = true
    userMovedRef.current = true
    setSelectedId(segmentId)
    const map = mapRef.current
    const ml = mlRef.current
    const s = mapSegments.find((m) => m.id === segmentId)
    if (!map || !ml || !s || !s.from) return
    const padding = framePadding(map)
    if (s.to && haversineKm(s.from, s.to) > 0.5) {
      map.fitBounds(new ml.LngLatBounds([s.from.lng, s.from.lat], [s.from.lng, s.from.lat]).extend([s.to.lng, s.to.lat]), { padding, duration: 1200, maxZoom: 12 })
    } else {
      map.flyTo({ center: [s.from.lng, s.from.lat], zoom: 14, duration: 1200 })
    }
  }

  function focusMe() {
    if (!live.position || !mapRef.current) return
    mapRef.current.flyTo({ center: [live.position.lng, live.position.lat], zoom: 14, duration: 1000 })
  }

  // ---- landmarks near the passenger, or near the selected place --------
  const landmarkKey = anchor ? `${anchor.point.lat.toFixed(2)},${anchor.point.lng.toFixed(2)}` : null
  useEffect(() => {
    if (!landmarkKey || !anchor) return
    if (landmarks?.key === landmarkKey) return
    let cancelled = false
    setLandmarks({ key: landmarkKey, items: [], error: null, loading: true })
    const t = setTimeout(() => {
      nearbyLandmarks(anchor.point)
        .then((items) => !cancelled && setLandmarks({ key: landmarkKey, items, error: null, loading: false }))
        .catch(() => !cancelled && setLandmarks({ key: landmarkKey, items: [], error: "Couldn't load nearby places right now.", loading: false }))
    }, 600)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [landmarkKey]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- rendering -------------------------------------------------------
  const labelOf = (id: string) => {
    const s = segments.find((x) => x.id === id)
    return s ? displaySegmentLabel(s) : 'A segment'
  }

  /** "You're at JFK — where AUD101 departs." / "You're at Rose Hall, Montego Bay (your hotel)." */
  function atPlaceText(at: NonNullable<ReturnType<typeof proximityReport>['atPlace']>): string {
    const s = segments.find((x) => x.id === at.segmentId)
    if (!s) return "You're at one of your trip's places."
    const place = at.role === 'from' ? s.departureLocationCode || s.departureLocation : s.arrivalLocationCode || s.arrivalLocation
    const label = displaySegmentLabel(s)
    if (!getFieldProfile(s.transportType).hasRoute) return `You're at ${place ?? label} — your ${s.transportType.toLowerCase().replace('_', ' ')}.`
    return `You're at ${place ?? 'the ' + (at.role === 'from' ? 'start' : 'end')} — where ${label} ${at.role === 'from' ? 'departs' : 'arrives'}.`
  }

  function directionsUrl(to: LatLng) {
    const origin = live.position ? `&origin=${live.position.lat},${live.position.lng}` : ''
    return `https://www.google.com/maps/dir/?api=1${origin}&destination=${to.lat},${to.lng}`
  }

  return (
    <div ref={shellRef} className={styles.shell} style={{ top: headerBottom, ['--sheet-h' as string]: `${sheetHeight}px` }}>
      <div ref={containerRef} className={styles.map} role="region" aria-label={`Map of ${trip.title}`} />
      {mapError && <div className={styles.fallback}>{mapError}</div>}

      {/* Markers, rendered as React into MapLibre's marker elements. */}
      {markerSlots.map(({ key, el }) => {
        if (key === 'me') return createPortal(<div className={styles.me} title="Your location" aria-label="Your location" role="img" />, el, key)
        if (key === 'vehicle' && vehicle) {
          const s = segments.find((x) => x.id === vehicle.segmentId)
          return createPortal(
            <div className={styles.vehicle} role="img" aria-label={`${labelOf(vehicle.segmentId)} — estimated position from its schedule`} title="Estimated position from schedule — not live radar">
              <TransportTypeIcon type={s?.transportType ?? 'OTHER'} size={18} />
            </div>,
            el,
            key
          )
        }
        if (key.startsWith('landmark:')) {
          const l = landmarks?.items[Number(key.split(':')[1])]
          return l ? createPortal(<div className={styles.landmarkDot} title={l.title} role="img" aria-label={`Landmark: ${l.title}`} />, el, key) : null
        }
        const g = groups.get(key)
        if (!g) return null
        const primary = g.entries.find((e) => e.segmentId === selectedId) ?? g.entries[0]
        const s = segments.find((x) => x.id === primary.segmentId)
        const isSelected = g.entries.some((e) => e.segmentId === selectedId)
        const names = [...new Set(g.entries.map((e) => labelOf(e.segmentId)))]
        return createPortal(
          <button
            type="button"
            className={`${styles.marker} ${isSelected ? styles.markerSelected : ''}`}
            style={{ borderColor: statusColor(s?.status ?? '') }}
            aria-label={names.join(', ')}
            title={names.join('\n')}
            onClick={() => {
              // Clicking a shared place cycles through the segments there.
              const ids = [...new Set(g.entries.map((e) => e.segmentId))]
              const idx = ids.indexOf(selectedId ?? '')
              select(ids[(idx + 1) % ids.length] ?? ids[0])
            }}
          >
            <TransportTypeIcon type={s?.transportType ?? 'OTHER'} size={16} />
            {names.length > 1 && <span className={styles.markerCount}>{names.length}</span>}
          </button>,
          el,
          key
        )
      })}

      {/* Top left: title, back to timeline, base map, live location. */}
      <section className={`${styles.panel} ${styles.topLeft}`} aria-label="Map controls">
        <h1 className={styles.title}>{trip.title}</h1>
        <div className={styles.row}>
          <Link href={`/trips/${trip.id}`} className={styles.chipBtn}>
            <List size={13} /> Timeline
          </Link>
          <div className={styles.seg} role="group" aria-label="Map style">
            <button type="button" className={styles.segBtn} aria-pressed={baseStyle === 'map'} onClick={() => setBaseStyle('map')}>Map</button>
            <button type="button" className={styles.segBtn} aria-pressed={baseStyle === 'satellite'} onClick={() => setBaseStyle('satellite')}>Satellite</button>
          </div>
          {live.supported && (
            <button
              type="button"
              className={styles.chipBtn}
              aria-pressed={live.enabled}
              onClick={() => (live.enabled ? live.stop() : live.start())}
              title={live.enabled ? 'Stop using my location' : 'Use my live location for proximity and nearby places'}
            >
              {live.enabled ? <LocateFixed size={13} /> : <LocateOff size={13} />}
              {live.enabled ? 'Location on' : 'Use my location'}
            </button>
          )}
          {live.position && (
            <button type="button" className={styles.chipBtn} onClick={focusMe}>
              <Navigation size={13} /> Me
            </button>
          )}
        </div>
        {live.error && <p className={`${styles.muted} ${styles.warn}`} role="alert" style={{ marginTop: 8 }}>{live.error}</p>}
        {unplaced.length > 0 && (
          <p className={styles.muted} style={{ marginTop: 8 }}>
            {unplaced.length === 1 ? '1 segment' : `${unplaced.length} segments`} couldn&rsquo;t be placed on the map — add an airport code or a fuller address with Manage.
          </p>
        )}
      </section>

      {/* Top right: what's happening now, proximity, landmarks. */}
      {now && (
        <section className={`${styles.panel} ${styles.topRight}`} aria-labelledby="map-insights-heading">
          <div className={styles.row} style={{ justifyContent: 'space-between' }}>
            <h2 id="map-insights-heading" className={styles.title} style={{ margin: 0 }}>Right now</h2>
            <button type="button" className={styles.chipBtn} aria-expanded={insightsOpen} onClick={() => setInsightsOpen((v) => !v)}>
              {insightsOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              <span className="sr-only">{insightsOpen ? 'Collapse' : 'Expand'}</span>
            </button>
          </div>
          {insightsOpen && (
            <div style={{ marginTop: 10 }}>
              {selected && <SelectedStatus segment={selected} now={now} endpoints={endpoints.get(selected.id)!} />}

              {report?.atPlace && (
                <>
                  <p className={styles.sectionLabel}>Where you are</p>
                  <p className={`${styles.insight} ${styles.good}`}>{atPlaceText(report.atPlace)}</p>
                </>
              )}

              {report?.current && (
                <>
                  <p className={styles.sectionLabel}>Underway</p>
                  <p className={styles.insight}>
                    {labelOf(report.current.segmentId)} is in progress — the icon on the map is its <strong>estimated</strong> position from its schedule, not live radar.
                  </p>
                  {report.current.probablyAboard === true && <p className={`${styles.insight} ${styles.good}`}>Your location matches — looks like you&rsquo;re on it.</p>}
                  {report.current.probablyAboard === false && (
                    <p className={`${styles.insight} ${styles.warn}`}>You&rsquo;re not near its estimated position. If you&rsquo;re meant to be on it, check its status on the pass below.</p>
                  )}
                </>
              )}

              <p className={styles.sectionLabel}>Next up</p>
              {!live.enabled ? (
                <p className={styles.muted}>
                  Turn on <strong>Use my location</strong> to see how far you are from your next stop and roughly when to leave. Your location stays in this browser.
                </p>
              ) : !live.position ? (
                <p className={styles.muted}>Finding your location…</p>
              ) : report?.next ? (
                <NextUp report={report.next} label={labelOf(report.next.segmentId)} directions={directionsUrl(mapSegments.find((s) => s.id === report.next!.segmentId)!.from!)} type={segments.find((s) => s.id === report.next!.segmentId)?.transportType ?? ''} />
              ) : (
                <p className={styles.muted}>Nothing on this trip starts in the next 24 hours.</p>
              )}

              {anchor && (
                <>
                  <p className={styles.sectionLabel}>
                    <LandmarkIcon size={10} style={{ display: 'inline', marginRight: 4, verticalAlign: '-1px' }} />
                    Nearby {anchor.label === 'you' ? 'you' : `· ${anchor.label}`}
                  </p>
                  {landmarks?.loading ? (
                    <p className={styles.muted}>Looking around…</p>
                  ) : landmarks?.error ? (
                    <p className={styles.muted}>{landmarks.error}</p>
                  ) : landmarks && landmarks.items.length > 0 ? (
                    <ul className={styles.landmarks}>
                      {landmarks.items.slice(0, 6).map((l) => (
                        <li key={l.url}>
                          <a href={l.url} target="_blank" rel="noopener noreferrer">{l.title}</a>{' '}
                          <span className={styles.muted}>· {formatDistance(haversineKm(anchor.point, l))}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className={styles.muted}>No notable places found nearby.</p>
                  )}
                  <p className={styles.muted} style={{ marginTop: 6 }}>From Wikipedia{live.enabled ? ' — only an approximate position (~1 km) is sent' : ''}.</p>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {/* Bottom: every segment, and the real boarding pass for the selected one. */}
      <section ref={sheetRef} className={`${styles.panel} ${styles.sheet}`} aria-label="Boarding passes">
        <div className={styles.sheetHead} role="tablist" aria-label="Trip segments">
          {segments.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={s.id === selected?.id}
              aria-current={s.id === selected?.id}
              className={styles.stripBtn}
              onClick={() => {
                select(s.id)
                setSheetOpen(true)
              }}
            >
              <span className={styles.statusDot} style={{ background: statusColor(s.status) }} aria-hidden="true" />
              <TransportTypeIcon type={s.transportType} size={13} />
              {displaySegmentLabel(s)}
            </button>
          ))}
          <button type="button" className={styles.chipBtn} style={{ marginLeft: 'auto' }} aria-expanded={sheetOpen} onClick={() => setSheetOpen((v) => !v)}>
            {sheetOpen ? <ChevronDown size={13} /> : <ChevronUp size={13} />}
            {sheetOpen ? 'Hide pass' : 'Show pass'}
          </button>
        </div>
        {sheetOpen && selected && (
          <div className={styles.sheetBody} role="tabpanel">
            {/* BoardingPass is sortable on the timeline; a one-item context satisfies it here. */}
            <DndContext>
              <SortableContext items={[selected.id]}>
                <BoardingPass
                  tripId={trip.id}
                  segment={selected}
                  passengers={trip.passengers}
                  nextSegment={segments[segments.indexOf(selected) + 1] ?? null}
                  homeTimezone={homeTimezone}
                  reorderable={false}
                />
              </SortableContext>
            </DndContext>
          </div>
        )}
        {segments.length === 0 && <p className={styles.muted} style={{ padding: '0 14px 14px' }}>No segments yet — add one from the timeline.</p>}
      </section>
    </div>
  )
}

/** The selected segment's own status, in its own time zone. */
function SelectedStatus({ segment, now, endpoints }: { segment: SegmentDTO; now: Date; endpoints: Endpoints }) {
  const zones = resolveSegmentZones(segment)
  const dep = segment.departureTime ? new Date(segment.departureTime) : null
  const arr = segment.arrivalTime ? new Date(segment.arrivalTime) : null
  const progress = scheduleProgress(dep, arr, now)
  let live: string | null = null
  try {
    const data = segment.monitoring?.lastKnownData ? (JSON.parse(segment.monitoring.lastKnownData) as { status?: string }) : null
    if (segment.monitoring?.status === 'ACTIVE' && data?.status && data.status !== 'UNKNOWN') live = data.status.replace('_', ' ').toLowerCase()
  } catch {
    live = null
  }
  const minutesToGo = dep ? Math.round((dep.getTime() - now.getTime()) / 60_000) : null
  const distance = endpoints.from && endpoints.to ? haversineKm(endpoints.from, endpoints.to) : null

  return (
    <>
      <p className={styles.sectionLabel}>Selected</p>
      <p className={styles.insight}>
        <strong>{displaySegmentLabel(segment)}</strong>{' '}
        <span className={segment.status === 'CANCELLED' ? styles.bad : segment.status === 'DELAYED' ? styles.warn : styles.good}>· {segment.status.toLowerCase()}</span>
        {live && <span className={styles.muted}> · live check: {live}</span>}
      </p>
      {dep && <p className={styles.muted}>Starts {formatFriendlyTime(dep, zones.departure)}{minutesToGo !== null && minutesToGo > 0 ? ` (in ${formatDuration(minutesToGo)})` : ''}</p>}
      {arr && <p className={styles.muted}>Ends {formatFriendlyTime(arr, zones.arrival ?? zones.departure)}</p>}
      {distance !== null && <p className={styles.muted}>Route about {formatDistance(distance)} as the crow flies.</p>}
      {progress !== null && (
        <p className={styles.muted}>
          About {Math.round(progress * 100)}% of the way by its schedule — an estimate, not a live position.
        </p>
      )}
    </>
  )
}

function NextUp({ report, label, directions, type }: { report: NonNullable<ReturnType<typeof proximityReport>['next']>; label: string; directions: string; type: string }) {
  const startsIn = formatDuration(Math.max(0, report.minutesUntilStart))
  const away = formatDistance(report.distanceKm)
  const verb = type === 'HOTEL' ? 'check-in' : type === 'RESTAURANT' ? 'reservation' : 'departure'
  return (
    <>
      {report.verdict === 'plenty_of_time' && (
        <p className={`${styles.insight} ${styles.good}`}>{label}: {verb} in {startsIn}, {away} away. You can leave in about {formatDuration(report.leaveInMinutes)}.</p>
      )}
      {report.verdict === 'leave_soon' && (
        <p className={`${styles.insight} ${styles.warn}`}>{label}: {verb} in {startsIn}, {away} away. Plan to leave within {formatDuration(Math.max(1, report.leaveInMinutes))}.</p>
      )}
      {report.verdict === 'cutting_it_close' && (
        <p className={`${styles.insight} ${styles.bad}`}>{label}: {verb} in {startsIn} and you&rsquo;re {away} away (about {formatDuration(report.travelMinutes)} by road) — that&rsquo;s less than the usual buffer. Consider leaving now.</p>
      )}
      {report.verdict === 'too_far_to_advise' && (
        <p className={styles.insight}>{label}: {verb} in {startsIn}. You&rsquo;re {away} away, so there&rsquo;s no leave-by estimate.</p>
      )}
      {report.verdict !== 'too_far_to_advise' && (
        <p className={styles.muted} style={{ marginTop: 4 }}>
          Rough estimate from straight-line distance.{' '}
          <a href={directions} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline' }}>Get real directions</a>
        </p>
      )}
    </>
  )
}
