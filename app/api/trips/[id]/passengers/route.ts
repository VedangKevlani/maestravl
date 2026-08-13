import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireUserId } from '@/lib/apiAuth'
import { sendPassengerAddedEmail } from '@/lib/email'
import { sendPassengerAddedText, isTextChannelConfigured } from '@/lib/sms'
import { segmentLabel } from '@/lib/monitoring/service'
import { resolveSegmentZones } from '@/lib/dateFormat'

const CreatePassengerSchema = z.object({
  name: z.string().trim().min(1).max(150),
  isPrimary: z.boolean().optional(),
  email: z.string().trim().email().optional().or(z.literal('')),
  phone: z.string().trim().max(40).optional(),
  emergencyContact: z.string().trim().max(200).optional(),
})

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireUserId()
  if ('error' in auth) return auth.error
  const { id: tripId } = await params

  const trip = await prisma.trip.findFirst({ where: { id: tripId, userId: auth.userId } })
  if (!trip) return NextResponse.json({ error: 'Trip not found' }, { status: 404 })

  const json = await req.json().catch(() => null)
  const parsed = CreatePassengerSchema.safeParse(json)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 })
  }

  const passenger = await prisma.passenger.create({
    data: {
      tripId,
      name: parsed.data.name,
      isPrimary: parsed.data.isPrimary ?? false,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      emergencyContact: parsed.data.emergencyContact || null,
    },
  })

  if (passenger.email) {
    const segments = await prisma.segment.findMany({
      where: { tripId },
      orderBy: { order: 'asc' },
      select: { identifier: true, provider: true, departureLocationCode: true, arrivalLocationCode: true, departureTime: true, timezone: true },
    })

    // Best-effort — a failed confirmation email shouldn't fail passenger creation.
    try {
      await sendPassengerAddedEmail(passenger.email, {
        recipientName: passenger.name,
        tripTitle: trip.title,
        segments: segments.map((s) => ({ label: segmentLabel(s), departureTime: s.departureTime, timezone: resolveSegmentZones(s).departure })),
      })
    } catch (err) {
      console.error('Failed to send passenger-added email', err)
    }
  }

  if (passenger.phone) {
    // Best-effort, same convention as the email above — a failed text
    // shouldn't fail passenger creation, and SMS/WhatsApp are independent
    // (a passenger can get both if both are configured).
    if (isTextChannelConfigured('SMS')) {
      try {
        await sendPassengerAddedText('SMS', passenger.phone, { recipientName: passenger.name, tripTitle: trip.title })
      } catch (err) {
        console.error('Failed to send passenger-added SMS', err)
      }
    }
    if (isTextChannelConfigured('WHATSAPP')) {
      try {
        await sendPassengerAddedText('WHATSAPP', passenger.phone, { recipientName: passenger.name, tripTitle: trip.title })
      } catch (err) {
        console.error('Failed to send passenger-added WhatsApp message', err)
      }
    }
  }

  return NextResponse.json({ passenger }, { status: 201 })
}
