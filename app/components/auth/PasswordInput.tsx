'use client'
import { useId, useState, forwardRef } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import styles from '../../styles/auth.module.css'

type PasswordInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>

const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, id, ...props }, ref) {
    const [visible, setVisible] = useState(false)
    const generatedId = useId()
    const inputId = id || generatedId

    return (
      <div className={styles.passwordWrap}>
        <input
          {...props}
          ref={ref}
          id={inputId}
          type={visible ? 'text' : 'password'}
          className={className ?? styles.input}
        />
        <button
          type="button"
          className={styles.toggleBtn}
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-controls={inputId}
          tabIndex={0}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
    )
  }
)

export default PasswordInput
