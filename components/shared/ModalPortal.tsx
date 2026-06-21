"use client"

import { useEffect, useState } from "react"
import { createPortal } from "react-dom"

/**
 * ModalPortal — renders overlay content into <body>.
 *
 * The dashboard's <main> uses `glass-1` (backdrop-filter) + `overflow-hidden`,
 * which makes any `position: fixed` descendant resolve against <main> instead
 * of the viewport — so an in-tree modal would be trapped in the content area
 * and fail to dim the sidebar. Portaling to <body> escapes that containing
 * block so overlays cover the whole app.
 */
export function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  if (!mounted) return null
  return createPortal(children, document.body)
}
