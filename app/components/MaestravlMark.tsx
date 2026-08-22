export default function MaestravlMark({ size = 48 }: { size?: number }) {
  return (
    <img
      src="/maestravl-logo.png"
      alt="Maestravl"
      style={{ height: size, width: 'auto', display: 'block' }}
    />
  )
}
