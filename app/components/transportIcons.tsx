// Single source of truth for "which icon represents this transport type,"
// reusing the exact same lucide-react icons as the type picker grid in
// TransportTypeForm.tsx's TYPE_OPTIONS — so the segment modal (preview +
// type picker), the live Segment Preview, and the Timeline all render the
// same icon for a given type instead of picker using lucide icons while
// everywhere else fell back to emoji.
import {
  Plane,
  Train,
  Bus,
  Ship,
  Anchor,
  Helicopter,
  Footprints,
  Car,
  Bike,
  Hotel,
  Utensils,
  MapPin,
  MoreHorizontal,
  type LucideIcon,
} from 'lucide-react'

export const TRANSPORT_TYPE_ICONS: Record<string, LucideIcon> = {
  FLIGHT: Plane,
  TRAIN: Train,
  BUS: Bus,
  TAXI: Car,
  FERRY: Ship,
  CRUISE: Ship,
  BOAT: Anchor,
  HELICOPTER: Helicopter,
  BICYCLE: Bike,
  RENTAL_CAR: Car,
  WALKING: Footprints,
  HOTEL: Hotel,
  RESTAURANT: Utensils,
  EXCURSION: MapPin,
  OTHER: MoreHorizontal,
}

export function TransportTypeIcon({ type, size = 16, ...rest }: { type: string; size?: number } & React.SVGProps<SVGSVGElement>) {
  const Icon = TRANSPORT_TYPE_ICONS[type.toUpperCase()] ?? MoreHorizontal
  return <Icon size={size} aria-hidden="true" {...rest} />
}
