'use client'

import { useEffect, useRef, useState } from 'react'
import { prepare, layout } from '@chenglou/pretext'

type BaseProps = {
  text: string
  /** CSS font string passed to pretext, e.g. "600 13px Outfit" */
  font: string
  /** Computed line-height in px used for layout calculation */
  lineHeightPx: number
  /** Maximum lines to show before clamping with an ellipsis */
  maxLines: number
  className?: string
}

type Props = BaseProps & (
  | { as?: 'div' }
  | { as: 'span' }
  | { as: 'a'; href: string; target?: string; rel?: string; onClick?: React.MouseEventHandler<HTMLAnchorElement> }
)

/**
 * Renders `text` allowing natural wrapping up to `maxLines` lines.
 * Uses @chenglou/pretext to measure line count without extra DOM reflows,
 * then applies CSS line-clamping only when the text truly overflows.
 * Re-measures on container resize (handles mobile orientation changes).
 */
export function TextClamp(props: Props) {
  const { text, font, lineHeightPx, maxLines, className = '' } = props
  const ref = useRef<HTMLElement>(null)
  const [clamped, setClamped] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    let ro: ResizeObserver | null = null
    let cancelled = false

    document.fonts.ready.then(() => {
      if (cancelled) return
      const prepared = prepare(text, font)

      const measure = () => {
        const w = el.offsetWidth
        if (w === 0) return
        const { lineCount } = layout(prepared, w, lineHeightPx)
        setClamped(lineCount > maxLines)
      }

      measure()
      ro = new ResizeObserver(measure)
      ro.observe(el)
    })

    return () => {
      cancelled = true
      ro?.disconnect()
    }
  }, [text, font, lineHeightPx, maxLines])

  const clampStyle: React.CSSProperties | undefined = clamped
    ? { overflow: 'hidden', display: '-webkit-box', WebkitBoxOrient: 'vertical', WebkitLineClamp: maxLines }
    : undefined

  if (props.as === 'a') {
    return (
      <a
        ref={ref as React.RefObject<HTMLAnchorElement>}
        href={props.href}
        target={props.target}
        rel={props.rel}
        onClick={props.onClick}
        className={className}
        style={clampStyle}
      >
        {text}
      </a>
    )
  }

  const Tag = props.as === 'span' ? 'span' : 'div'
  return (
    <Tag
      ref={ref as React.RefObject<HTMLDivElement>}
      className={className}
      style={clampStyle}
    >
      {text}
    </Tag>
  )
}
