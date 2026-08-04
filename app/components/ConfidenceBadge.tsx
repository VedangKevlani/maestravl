export default function ConfidenceBadge({ confidence }: { confidence: number }) {
  const color = confidence >= 85 ? '#52b788' : confidence >= 70 ? '#d4a853' : '#ef4444'
  const bg = confidence >= 85 ? 'rgba(82,183,136,0.12)' : confidence >= 70 ? 'rgba(212,168,83,0.12)' : 'rgba(239,68,68,0.12)'
  const label = confidence >= 85 ? 'high confidence' : confidence >= 70 ? 'medium confidence' : 'needs review'

  return (
    <span
      className="text-label px-2 py-0.5 rounded-full inline-flex items-center gap-1"
      style={{ background: bg, color, fontSize: '0.58rem' }}
      title={`${confidence}% — ${label}`}
    >
      {confidence}%
    </span>
  )
}
