"use client"

import type React from "react"
import { useRef, useEffect } from "react"
import { useGesture } from "@use-gesture/react"

interface PdfZoomContainerProps {
  canvasRef: React.RefObject<HTMLCanvasElement>
  minZoom?: number
  maxZoom?: number
  defaultZoom?: number
}

/**
 * PdfZoomContainer - High-performance pinch-to-zoom and pan for PDF canvas
 *
 * Performance optimizations:
 * - Uses refs instead of state to avoid React re-renders during gestures
 * - Applies transforms directly via element.style.transform (GPU-accelerated)
 * - Uses requestAnimationFrame for smooth 60fps updates
 * - No spring animations during active gestures = instant response
 *
 * Tuning responsiveness:
 * - PINCH_SCALE_MULTIPLIER: Controls how much each pinch changes zoom (higher = more sensitive)
 * - PAN_FRICTION: Controls pan smoothness (lower = more responsive, higher = smoother)
 * - minZoom/maxZoom: Zoom boundaries
 */
export default function PdfZoomContainer({
  canvasRef,
  minZoom = 0.5,
  maxZoom = 5.0,
  defaultZoom = 1.0,
}: PdfZoomContainerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)
  const lastTapRef = useRef<number>(0)

  const scaleRef = useRef<number>(defaultZoom)
  const offsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })
  const rafIdRef = useRef<number | null>(null)

  // Configuration constants - adjust these to tune responsiveness
  const PINCH_SCALE_MULTIPLIER = 1.5 // Higher = more sensitive zoom (1.0 = default, 2.0 = very sensitive)
  const MIN_SCALE_CHANGE = 0.001 // Minimum scale change to apply (prevents tiny jitters)

  const updateTransform = () => {
    if (!wrapperRef.current) return

    const { x, y } = offsetRef.current
    const scale = scaleRef.current

    // Apply transform directly to DOM (GPU-accelerated, no React re-render)
    wrapperRef.current.style.transform = `translate(${x}px, ${y}px) scale(${scale})`

    // Update cursor based on zoom level
    if (containerRef.current) {
      containerRef.current.style.cursor = scale > 1 ? "grab" : "default"
    }

    rafIdRef.current = null
  }

  const scheduleUpdate = () => {
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(updateTransform)
    }
  }

  // Reset zoom when canvas changes (e.g., page navigation)
  useEffect(() => {
    scaleRef.current = defaultZoom
    offsetRef.current = { x: 0, y: 0 }
    scheduleUpdate()
  }, [canvasRef.current, defaultZoom])

  // Cleanup RAF on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
      }
    }
  }, [])

  useGesture(
    {
      // Pinch gesture for zooming - updates happen in real-time via refs
      onPinch: ({ offset: [scale], da: [deltaScale], first, last }) => {
        if (first) {
          // Store initial scale at start of pinch
          scaleRef.current = scaleRef.current || defaultZoom
        }

        // The gesture library gives us a scale value, we multiply by sensitivity
        const newScale = scale * PINCH_SCALE_MULTIPLIER
        const clampedScale = Math.max(minZoom, Math.min(maxZoom, newScale))

        // Only update if change is significant (reduces jitter)
        if (Math.abs(clampedScale - scaleRef.current) > MIN_SCALE_CHANGE) {
          scaleRef.current = clampedScale
          scheduleUpdate()
        }

        // Reset pan when zooming out to 1x or below
        if (last && scaleRef.current <= 1.0) {
          offsetRef.current = { x: 0, y: 0 }
          scheduleUpdate()
        }
      },

      // Drag gesture for panning - only active when zoomed in
      onDrag: ({ offset: [x, y], pinching, movement: [mx, my], first, last, memo }) => {
        // Don't pan while pinching
        if (pinching) return memo

        const currentScale = scaleRef.current

        // Only allow panning when zoomed in beyond default
        if (currentScale <= 1.0) {
          offsetRef.current = { x: 0, y: 0 }
          scheduleUpdate()
          return memo
        }

        if ((first || !memo) && containerRef.current && canvasRef.current) {
          const canvas = canvasRef.current
          const containerRect = containerRef.current.getBoundingClientRect()

          // Calculate max pan boundaries based on current scale
          // Canvas is rendered at 2x pixel density, so divide by 2
          const scaledWidth = (canvas.width * currentScale) / 2
          const scaledHeight = (canvas.height * currentScale) / 2
          const maxX = Math.max(0, (scaledWidth - containerRect.width / 2) / currentScale)
          const maxY = Math.max(0, (scaledHeight - containerRect.height / 2) / currentScale)

          memo = { maxX, maxY }
        }

        if (!memo) return

        const constrainedX = Math.max(-memo.maxX, Math.min(memo.maxX, x))
        const constrainedY = Math.max(-memo.maxY, Math.min(memo.maxY, y))

        offsetRef.current = { x: constrainedX, y: constrainedY }
        scheduleUpdate()

        return memo
      },

      // Double-tap to zoom in/out
      onClick: ({ event }) => {
        const now = Date.now()
        const timeSinceLastTap = now - lastTapRef.current

        // Double-tap detected (within 300ms)
        if (timeSinceLastTap < 300 && timeSinceLastTap > 0) {
          event.preventDefault()
          const currentScale = scaleRef.current

          // Toggle between default zoom and 2x zoom
          const targetScale = currentScale > defaultZoom + 0.1 ? defaultZoom : Math.min(maxZoom, defaultZoom * 2)

          scaleRef.current = targetScale
          offsetRef.current = { x: 0, y: 0 }
          scheduleUpdate()

          lastTapRef.current = 0
        } else {
          lastTapRef.current = now
        }
      },
    },
    {
      target: containerRef,
      drag: {
        from: () => [offsetRef.current.x, offsetRef.current.y],
        // No filtering/smoothing - raw input for instant response
        filterTaps: true,
      },
      pinch: {
        from: () => [scaleRef.current, 0],
        scaleBounds: { min: minZoom, max: maxZoom },
        rubberband: false, // Disable rubberband for more direct feel
        // Disable internal smoothing for instant response
        threshold: 0,
      },
      eventOptions: { passive: false },
    },
  )

  return (
    <div ref={containerRef} className="relative w-full h-[60vh] overflow-hidden touch-none select-none">
      <div
        ref={wrapperRef}
        className="absolute inset-0 flex items-center justify-center will-change-transform"
        style={{
          touchAction: "none",
          transform: `translate(${offsetRef.current.x}px, ${offsetRef.current.y}px) scale(${scaleRef.current})`,
        }}
      >
        <canvas
          ref={canvasRef}
          className="border border-border rounded-lg shadow-lg"
          style={{
            maxWidth: "100%",
            maxHeight: "100%",
            width: "auto",
            height: "auto",
            pointerEvents: "none", // Prevent canvas from interfering with gestures
          }}
        />
      </div>
    </div>
  )
}
