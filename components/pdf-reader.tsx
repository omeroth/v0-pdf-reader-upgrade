"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import {
  Upload,
  Moon,
  Sun,
  Bookmark,
  BookmarkCheck,
  Settings,
  Play,
  Pause,
  Library,
  Search,
  Trophy,
  StickyNote,
  ChevronLeft,
  ChevronRight,
  Home,
  TrendingUp,
  FileText,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList } from "@/components/ui/tabs" // Import TabsList
import { AnimatePresence, motion } from "framer-motion" // Import framer-motion for animations
import PdfZoomContainer from "@/components/pdf-zoom-container" // Import PdfZoomContainer component
import { type Note, getNotes, saveNote as saveNoteToStorage, migrateOldNotes } from "@/lib/notes"
import { NotesPanel } from "./notes-panel"

type PdfTextItem = {
  str: string
  transform: number[]
  width: number
  height: number
  fontName?: string
  isBold: boolean
}

type TextSegment = {
  text: string
  isBold: boolean
}

export default function PDFReader() {
  const [content, setContent] = useState("")
  const [pages, setPages] = useState<string[]>([])
  const [currentPage, setCurrentPage] = useState(0)
  const [fileName, setFileName] = useState("")
  const [fontSize, setFontSize] = useState(18)
  const [wordsPerPage, setWordsPerPage] = useState(120)
  const [isLoading, setIsLoading] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [error, setError] = useState("")
  const [pdfLoaded, setPdfLoaded] = useState(false)
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    if (typeof window === "undefined") return false // SSR safety
    const savedTheme = localStorage.getItem("theme")
    if (savedTheme === "dark") return true
    if (savedTheme === "light") return false
    return false // Default to light mode
  })

  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)
  const [bookmarks, setBookmarks] = useState<number[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [showLibrary, setShowLibrary] = useState(false)
  const [library, setLibrary] = useState<any[]>([])
  const [autoAdvance, setAutoAdvance] = useState(false)
  const [autoAdvanceSpeed, setAutoAdvanceSpeed] = useState(10)
  const [pageDirection, setPageDirection] = useState<"next" | "prev">("next")
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<number[]>([])
  const [highlightedMatch, setHighlightedMatch] = useState<{ page: number; text: string } | null>(null)
  const [isSearchClosing, setIsSearchClosing] = useState(false)
  const [dailyGoal, setDailyGoal] = useState(20)
  const [streak, setStreak] = useState(0)
  const [todayPages, setTodayPages] = useState(0)
  const [achievements, setAchievements] = useState<any[]>([])
  const [notes, setNotes] = useState<Record<number, string>>({})
  const [structuredNotes, setStructuredNotes] = useState<Note[]>([])
  const [showNotesPanel, setShowNotesPanel] = useState(false)
  const [showNoteModal, setShowNoteModal] = useState(false)
  const [currentNote, setCurrentNote] = useState("")
  const [readingStats, setReadingStats] = useState({
    totalPages: 0,
    pagesRead: 0,
    readingTime: 0,
  })
  const [pdfFile, setPdfFile] = useState<Uint8Array | null>(null)
  const [pdfFileBackup, setPdfFileBackup] = useState<number[] | null>(null) // Add a separate state to store a persistent copy of the PDF data for saving
  const [pageMap, setPageMap] = useState<number[]>([])
  const [showPdfViewer, setShowPdfViewer] = useState(false)
  const [highlightSnippet, setHighlightSnippet] = useState<string>("")
  const [highlightRects, setHighlightRects] = useState<Array<{ x: number; y: number; width: number; height: number }>>(
    [],
  )
  const [pdfCurrentPage, setPdfCurrentPage] = useState(1)
  const [pdfNumPages, setPdfNumPages] = useState(0)
  const pdfCanvasRef = useRef<HTMLCanvasElement>(null)
  const [pdfDoc, setPdfDoc] = useState<any>(null)
  const pdfContainerRef = useRef<HTMLDivElement>(null)
  const readingAreaRef = useRef<HTMLDivElement>(null)
  const MIN_ZOOM = 0.5 // Minimum zoom level (50%)
  const MAX_ZOOM = 5.0 // Maximum zoom level (500%)
  const DEFAULT_ZOOM = 1.0 // Default zoom level (100%)

  const [formattedPages, setFormattedPages] = useState<TextSegment[][]>([])

  const [direction, setDirection] = useState<"ltr" | "rtl">("ltr") // Added direction state
  const [directionMode, setDirectionMode] = useState<"auto" | "ltr" | "rtl">("auto") // Added directionMode state

  const minSwipeDistance = 50

  const vibrate = () => {
    if (navigator.vibrate) {
      navigator.vibrate(10)
    }
  }

  // PDF.js initialization
  useEffect(() => {
    const script = document.createElement("script")
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
    script.onload = () => {
      if (window.pdfjsLib) {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
        setPdfLoaded(true)
      }
    }
    document.head.appendChild(script)

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script)
      }
    }
  }, [])

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add("dark")
    } else {
      document.documentElement.classList.remove("dark")
    }
    // Save theme preference to localStorage
    localStorage.setItem("theme", darkMode ? "dark" : "light")
  }, [darkMode])

  // Load saved data
  useEffect(() => {
    const loadSavedData = async () => {
      if (typeof window !== "undefined") {
        try {
          const libraryData = localStorage.getItem("book-library")
          if (libraryData) {
            setLibrary(JSON.parse(libraryData))
          }

          const streakData = localStorage.getItem("reading-streak")
          if (streakData) {
            const data = JSON.parse(streakData)
            setStreak(data.streak || 0)
          }

          const todayData = localStorage.getItem("today-pages")
          if (todayData) {
            const data = JSON.JSON.parse(todayData)
            const savedDate = new Date(data.date).toDateString()
            const today = new Date().toDateString()
            if (savedDate === today) {
              setTodayPages(data.pages || 0)
            }
          }
        } catch (err) {
          console.log("No saved data found")
        }
      }
    }
    loadSavedData()
  }, [])

  // Auto-advance feature
  useEffect(() => {
    if (autoAdvance && content && currentPage < pages.length - 1) {
      const timer = setInterval(() => {
        setCurrentPage((prev) => prev + 1)
        setPageDirection("next")
        vibrate()
      }, autoAdvanceSpeed * 1000)

      return () => clearInterval(timer)
    }
  }, [autoAdvance, currentPage, pages.length, autoAdvanceSpeed, content])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (content && !showSearch && !showNoteModal && !showPdfViewer) {
        // Added condition to close keyboard nav when PDF viewer is open
        if (e.key === "ArrowRight" || e.key === "PageDown") {
          goToNextPage()
        } else if (e.key === "ArrowLeft" || e.key === "PageUp") {
          goToPrevPage()
        }
      }
    }
    window.addEventListener("keydown", handleKeyPress)
    return () => window.removeEventListener("keydown", handleKeyPress)
  }, [content, showSearch, showNoteModal, currentPage, pages.length, showPdfViewer]) // Added showPdfViewer to dependency array

  // Touch swipe handlers
  const onTouchStart = (e: React.TouchEvent) => {
    if (showPdfViewer) return // Ignore touch events if PDF viewer is open
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    if (showPdfViewer) return // Ignore touch events if PDF viewer is open
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const onTouchEnd = () => {
    if (showPdfViewer) return // Ignore touch events if PDF viewer is open
    if (!touchStart || !touchEnd) return

    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (isLeftSwipe) {
      goToNextPage()
    }
    if (isRightSwipe) {
      goToPrevPage()
    }
  }

  const splitIntoPages = (text: string) => {
    const words = text.split(" ")
    const pageArray: string[] = []

    for (let i = 0; i < words.length; i += wordsPerPage) {
      const pageWords = words.slice(i, i + wordsPerPage)
      pageArray.push(pageWords.join(" "))
    }

    return pageArray
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    setIsLoading(true)
    setLoadingProgress(0)
    setError("")
    setFileName(file.name)

    try {
      if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        if (!window.pdfjsLib) {
          setError("PDF library is still loading. Please wait a moment and try again.")
          setIsLoading(false)
          return
        }

        const arrayBuffer = await file.arrayBuffer()
        const typedArray = new Uint8Array(arrayBuffer)

        setPdfFileBackup(Array.from(typedArray))
        setPdfFile(new Uint8Array(typedArray))

        const loadingTask = window.pdfjsLib.getDocument({ data: typedArray })

        loadingTask.onProgress = (progress: any) => {
          const percent = Math.round((progress.loaded / progress.total) * 50)
          setLoadingProgress(percent)
        }

        const pdf = await loadingTask.promise

        setPdfDoc(pdf)
        setPdfNumPages(pdf.numPages)

        let fullText = ""
        const textByPdfPage: string[] = []
        const formattedPageSegments: TextSegment[][] = []

        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum)
          const textContent = await page.getTextContent()

          const progressPercent = 50 + Math.round((pageNum / pdf.numPages) * 50)
          setLoadingProgress(progressPercent)

          const items: PdfTextItem[] = textContent.items.map((item: any) => {
            const fontName = item.fontName || ""
            const isBold = /bold|semibold|medium|black|heavy/i.test(fontName)

            return {
              str: item.str,
              transform: item.transform,
              width: item.width,
              height: item.height,
              fontName: item.fontName,
              isBold,
            }
          })

          let lastY: number | null = null
          const segments: TextSegment[] = []
          let currentSegment: TextSegment = { text: "", isBold: false }

          for (const item of items) {
            const y = item.transform[5]
            const text = item.str

            // Check for line break
            if (lastY !== null && Math.abs(lastY - y) > 5) {
              if (currentSegment.text) {
                segments.push(currentSegment)
              }
              segments.push({ text: "\n", isBold: false })
              currentSegment = { text: "", isBold: item.isBold }
            }

            // If bold state changes, flush current segment
            if (currentSegment.text && currentSegment.isBold !== item.isBold) {
              segments.push(currentSegment)
              currentSegment = { text: "", isBold: item.isBold }
            }

            currentSegment.text += (currentSegment.text ? " " : "") + text
            currentSegment.isBold = item.isBold
            lastY = y
          }

          if (currentSegment.text) {
            segments.push(currentSegment)
          }

          formattedPageSegments.push(segments)

          // Build plain text for page mapping
          const pageText = segments.map((s) => s.text).join(" ")
          fullText += pageText + " "
          textByPdfPage.push(pageText)
        }

        fullText = fullText.replace(/\s+/g, " ").trim()

        if (fullText.length > 10) {
          setContent(fullText)
          const pageArray = splitIntoPages(fullText)
          setPages(pageArray)

          const wordsInSegments = formattedPageSegments.flat()
          const pagesWithFormatting: TextSegment[][] = []
          let currentPageSegments: TextSegment[] = []
          let wordCount = 0

          for (const segment of wordsInSegments) {
            const segmentWords = segment.text.split(/\s+/).filter((w) => w.length > 0)

            if (wordCount + segmentWords.length > wordsPerPage && currentPageSegments.length > 0) {
              pagesWithFormatting.push(currentPageSegments)
              currentPageSegments = []
              wordCount = 0
            }

            currentPageSegments.push(segment)
            wordCount += segmentWords.length
          }

          if (currentPageSegments.length > 0) {
            pagesWithFormatting.push(currentPageSegments)
          }

          setFormattedPages(pagesWithFormatting)

          const mapping = createPageMapping(textByPdfPage, pageArray, pdf.numPages)
          setPageMap(mapping)

          if (typeof window !== "undefined") {
            try {
              const libraryData = localStorage.getItem("book-library")
              if (libraryData) {
                const currentLibrary = JSON.parse(libraryData)
                const existingBook = currentLibrary.find((book: any) => book.fileName === file.name)
                if (existingBook) {
                  setCurrentPage(existingBook.currentPage || 0)
                  setBookmarks(existingBook.bookmarks || [])
                  setNotes(existingBook.notes || {})
                  setDirection(existingBook.direction || "ltr")
                  setDirectionMode(existingBook.directionMode || "auto")
                } else {
                  setCurrentPage(0)
                }
              } else {
                setCurrentPage(0)
              }
            } catch (err) {
              setCurrentPage(0)
            }
          } else {
            setCurrentPage(0)
          }
          setReadingStats({
            totalPages: pageArray.length,
            pagesRead: 1,
            readingTime: 0,
          })
          setPdfLoaded(true)

          if (directionMode === "auto") {
            const detectedDir = isLikelyHebrew(fullText) ? "rtl" : "ltr"
            setDirection(detectedDir)
          }
        } else {
          setError("No readable text found in this PDF.")
        }
      } else if (file.type === "text/plain" || file.name.endsWith(".txt")) {
        const text = await file.text()
        setContent(text)
        const pageArray = splitIntoPages(text)
        setPages(pageArray)
        // Reset formatted pages for text files
        setFormattedPages(pageArray.map((page) => page.split(/\s+/).map((word) => ({ text: word, isBold: false }))))

        if (typeof window !== "undefined") {
          try {
            const libraryData = localStorage.getItem("book-library")
            if (libraryData) {
              const currentLibrary = JSON.parse(libraryData)
              const existingBook = currentLibrary.find((book: any) => book.fileName === file.name)
              if (existingBook) {
                setCurrentPage(existingBook.currentPage || 0)
                setBookmarks(existingBook.bookmarks || [])
                setNotes(existingBook.notes || {})
                setDirection(existingBook.direction || "ltr")
                setDirectionMode(existingBook.directionMode || "auto")
              } else {
                setCurrentPage(0)
              }
            } else {
              setCurrentPage(0)
            }
          } catch (err) {
            setCurrentPage(0)
          }
        } else {
          setCurrentPage(0)
        }
        setReadingStats({
          totalPages: pageArray.length,
          pagesRead: 1,
          readingTime: 0,
        })
        setPdfLoaded(true)

        if (directionMode === "auto") {
          const detectedDir = isLikelyHebrew(text) ? "rtl" : "ltr"
          setDirection(detectedDir)
        }
      } else {
        setError("Please upload a PDF or text file.")
      }
    } catch (err: any) {
      setError(`Error loading file: ${err.message}`)
      console.error(err)
    } finally {
      setIsLoading(false)
      setLoadingProgress(0)
    }
  }

  const createPageMapping = (textByPdfPage: string[], textPages: string[], numPdfPages: number): number[] => {
    const mapping: number[] = []
    const cumulativeWordCounts = [0]

    // Calculate cumulative word counts for each PDF page
    for (const text of textByPdfPage) {
      cumulativeWordCounts.push(cumulativeWordCounts[cumulativeWordCounts.length - 1] + text.split(" ").length)
    }

    // Map each text page to a PDF page based on word position
    for (let i = 0; i < textPages.length; i++) {
      const textPageWordCount = textPages[i].split(" ").length
      const textPageStartWord = i * wordsPerPage
      const textPageMidpoint = textPageStartWord + textPageWordCount / 2

      let pdfPage = 1
      for (let j = 0; j < cumulativeWordCounts.length - 1; j++) {
        if (textPageMidpoint >= cumulativeWordCounts[j] && textPageMidpoint < cumulativeWordCounts[j + 1]) {
          pdfPage = j + 1
          break
        }
      }

      mapping.push(Math.min(pdfPage, numPdfPages))
    }

    return mapping
  }

  const goToOriginalPdf = () => {
    if (!pdfFile || !pageMap.length) {
      alert("Original PDF is not available")
      return
    }

    const mappedPdfPage = pageMap[currentPage] || 1

    // Extract text snippet from current page for highlighting
    const currentPageText = pages[currentPage] || ""
    const HIGHLIGHT_MAX_CHARS = 300
    const snippet = currentPageText.slice(0, HIGHLIGHT_MAX_CHARS).trim()

    setHighlightSnippet(snippet)
    setPdfCurrentPage(mappedPdfPage)
    setShowPdfViewer(true)

    // Render the PDF page with highlighting after state is set
    setTimeout(() => renderPdfPageWithHighlight(mappedPdfPage, snippet), 100)
  }

  const renderPdfPageWithHighlight = async (pageNum: number, snippet: string) => {
    if (!pdfDoc || !pdfCanvasRef.current) return

    try {
      const page = await pdfDoc.getPage(pageNum)
      const canvas = pdfCanvasRef.current
      const context = canvas.getContext("2d")

      if (!context) return

      const viewport = page.getViewport({ scale: 2 })
      canvas.width = viewport.width
      canvas.height = viewport.height

      // Render the PDF page first
      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      }
      await page.render(renderContext).promise

      // Then compute and draw highlights
      if (snippet) {
        await computeAndDrawHighlights(page, viewport, context, snippet)
      }
    } catch (err) {
      console.error("[v0] Error rendering PDF page:", err)
    }
  }

  const computeAndDrawHighlights = async (
    page: any,
    viewport: any,
    context: CanvasRenderingContext2D,
    snippet: string,
  ) => {
    try {
      // Get text content with positions
      const textContent = await page.getTextContent({
        normalizeWhitespace: true,
        disableCombineTextItems: false,
      })

      type TextItemWithPos = {
        text: string
        x: number
        y: number
        width: number
        height: number
        charIndex: number
      }

      const items: TextItemWithPos[] = []
      let fullText = ""
      let charIndex = 0

      // Build text items with positions
      for (const item of textContent.items) {
        if (!item.str) continue

        const text = item.str
        const transform = item.transform
        const x = transform[4]
        const y = transform[5]
        const width = item.width
        const height = item.height

        items.push({
          text,
          x: viewport.convertToViewportPoint(x, y)[0],
          y: viewport.convertToViewportPoint(x, y)[1],
          width: width * viewport.scale,
          height: height * viewport.scale,
          charIndex,
        })

        fullText += text + " "
        charIndex = fullText.length
      }

      // Normalize and search for snippet
      const normalizeText = (text: string) => text.replace(/\s+/g, " ").trim().toLowerCase()
      const normalizedPageText = normalizeText(fullText)
      const normalizedSnippet = normalizeText(snippet)

      let matchIndex = normalizedPageText.indexOf(normalizedSnippet)

      // Try shorter snippet if not found
      if (matchIndex === -1 && normalizedSnippet.length > 150) {
        const shorterSnippet = normalizedSnippet.slice(0, 150)
        matchIndex = normalizedPageText.indexOf(shorterSnippet)
      }

      if (matchIndex === -1) {
        console.log("[v0] Highlight snippet not found on this PDF page")
        return
      }

      // Find which items contain the matched text
      const matchEnd = matchIndex + normalizedSnippet.length
      const rects: Array<{ x: number; y: number; width: number; height: number }> = []

      for (const item of items) {
        const itemStart = item.charIndex
        const itemEnd = item.charIndex + item.text.length // +1 for space

        // Check if this item overlaps with the match
        if (itemStart < matchEnd && itemEnd > matchIndex) {
          rects.push({
            x: item.x,
            y: item.y - item.height,
            width: item.width,
            height: item.height,
          })
        }
      }

      // Draw highlight rectangles
      context.save()
      context.fillStyle = "rgba(255, 235, 59, 0.4)" // Yellow highlight
      for (const rect of rects) {
        context.fillRect(rect.x, rect.y, rect.width, rect.height)
      }
      context.restore()

      setHighlightRects(rects)
      console.log("[v0] Highlighted", rects.length, "text regions")
    } catch (err) {
      console.error("[v0] Error computing highlights:", err)
      setHighlightRects([])
    }
  }

  const renderPdfPage = async (pageNum: number) => {
    if (!pdfDoc || !pdfCanvasRef.current) return

    try {
      const page = await pdfDoc.getPage(pageNum)
      const canvas = pdfCanvasRef.current
      const context = canvas.getContext("2d")

      if (!context) return

      const viewport = page.getViewport({ scale: 2 })
      canvas.width = viewport.width
      canvas.height = viewport.height

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      }

      await page.render(renderContext).promise

      if (highlightSnippet) {
        await computeAndDrawHighlights(page, viewport, context, highlightSnippet)
      }
    } catch (err) {
      console.error("[v0] Error rendering PDF page:", err)
    }
  }

  useEffect(() => {
    if (showPdfViewer && pdfDoc && pdfCurrentPage) {
      renderPdfPage(pdfCurrentPage)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfCurrentPage, showPdfViewer, pdfDoc])

  const goToNextPage = () => {
    if (currentPage < pages.length - 1) {
      setPageDirection("next")
      setCurrentPage((prev) => prev + 1)
      vibrate()

      const newTodayPages = todayPages + 1
      setTodayPages(newTodayPages)
      setReadingStats((prev) => ({
        ...prev,
        pagesRead: Math.max(prev.pagesRead, currentPage + 2),
      }))
    }
  }

  const goToPrevPage = () => {
    if (currentPage > 0) {
      setPageDirection("prev")
      setCurrentPage((prev) => prev - 1)
      vibrate()
    }
  }

  const toggleBookmark = () => {
    setBookmarks((prev) =>
      prev.includes(currentPage) ? prev.filter((p) => p !== currentPage) : [...prev, currentPage],
    )
    vibrate()
  }

  const resetReader = () => {
    setContent("")
    setPages([])
    setCurrentPage(0)
    setFileName("")
    setError("")
    setBookmarks([])
    setAutoAdvance(false)
    setReadingStats({
      totalPages: 0,
      pagesRead: 0,
      readingTime: 0,
    })
    setPdfFile(null)
    setPdfFileBackup(null)
    setPageMap([])
    setShowPdfViewer(false)
    setPdfCurrentPage(1)
    setPdfNumPages(0)
    setPdfDoc(null)
    setDirectionMode("auto")
    setDirection("ltr")
    setStructuredNotes([]) // Clear structured notes on reset
    setFormattedPages([]) // Clear formatted pages on reset
    setHighlightSnippet("") // Clear highlight snippet
    setHighlightRects([]) // Clear highlight rectangles
  }

  const handleSearch = () => {
    if (!searchQuery.trim()) return

    const results: number[] = []
    pages.forEach((page, index) => {
      if (page.toLowerCase().includes(searchQuery.toLowerCase())) {
        results.push(index)
      }
    })
    setSearchResults(results)
  }

  const goToSearchResult = (targetPageIndex: number) => {
    // Step 1: Start closing the modal with animation
    setIsSearchClosing(true)

    // Step 2: Wait for modal exit animation (~300ms) before changing page
    setTimeout(() => {
      // Set page direction based on whether we're going forward or backward
      setPageDirection(targetPageIndex > currentPage ? "next" : "prev")

      // Navigate to the target page
      setCurrentPage(targetPageIndex)

      // Step 3: Add temporary highlight to show the matched text
      setHighlightedMatch({ page: targetPageIndex, text: searchQuery })

      // Step 4: Close the modal after page transition starts
      setShowSearch(false)
      setIsSearchClosing(false)

      // Step 5: Scroll the reading area to top smoothly
      if (readingAreaRef.current) {
        readingAreaRef.current.scrollTo({
          top: 0,
          behavior: "smooth",
        })
      }

      // Step 6: Remove highlight after 1.5 seconds
      setTimeout(() => {
        setHighlightedMatch(null)
      }, 1500)
    }, 300) // Wait for modal exit animation
  }

  const highlightText = (text: string, query: string) => {
    if (!query.trim()) return text

    const parts = text.split(new RegExp(`(${query})`, "gi"))
    return parts.map((part, index) => {
      if (part.toLowerCase() === query.toLowerCase()) {
        return (
          <mark
            key={index}
            className="bg-yellow-200 dark:bg-yellow-900/50 transition-all duration-1000 ease-out animate-pulse"
            style={{
              animation: "highlightFade 1.5s ease-out forwards",
            }}
          >
            {part}
          </mark>
        )
      }
      return part
    })
  }

  useEffect(() => {
    if (fileName) {
      const loadedNotes = getNotes(fileName)
      setStructuredNotes(loadedNotes)

      // Migrate old notes format if needed
      if (Object.keys(notes).length > 0 && loadedNotes.length === 0) {
        const migratedNotes = migrateOldNotes(fileName, notes)
        migratedNotes.forEach((note) => saveNoteToStorage(note))
        setStructuredNotes(migratedNotes)
      }
    }
  }, [fileName])

  const saveNote = () => {
    setNotes((prev) => ({
      ...prev,
      [currentPage]: currentNote,
    }))

    // Save to new structured format
    if (fileName && currentNote.trim()) {
      const newNote: Note = {
        id: `${fileName}-${currentPage}-${Date.now()}`,
        bookId: fileName,
        pageIndex: currentPage,
        text: currentNote.trim(),
        snippet: pages[currentPage]?.substring(0, 100),
        createdAt: new Date().toISOString(),
      }

      saveNoteToStorage(newNote)
      setStructuredNotes((prev) => [...prev, newNote])
    }

    setShowNoteModal(false)
    setCurrentNote("")
    vibrate()
  }

  const handleNoteSelected = (note: Note) => {
    setShowNotesPanel(false)
    setCurrentPage(note.pageIndex)

    // Optionally highlight the note briefly
    setTimeout(() => {
      const noteElement = document.querySelector(`[data-note-page="${note.pageIndex}"]`)
      if (noteElement) {
        noteElement.classList.add("highlight-flash")
        setTimeout(() => {
          noteElement.classList.remove("highlight-flash")
        }, 1500)
      }
    }, 300)
  }

  const handleNotesChanged = () => {
    if (fileName) {
      const loadedNotes = getNotes(fileName)
      setStructuredNotes(loadedNotes)
    }
  }

  // Debounced save operation for book progress
  useEffect(() => {
    if (content && fileName && pages.length > 0) {
      const saveProgress = () => {
        if (typeof window !== "undefined") {
          try {
            // Get current library
            const libraryData = localStorage.getItem("book-library")
            let currentLibrary = []
            if (libraryData) {
              currentLibrary = JSON.parse(libraryData)
            }

            // Find if this book already exists in library
            const bookIndex = currentLibrary.findIndex((book: any) => book.fileName === fileName)

            const bookData = {
              fileName,
              currentPage,
              totalPages: pages.length,
              lastRead: new Date().toISOString(),
              content,
              bookmarks,
              notes,
              direction,
              directionMode,
              pdfFileData: pdfFileBackup,
              pageMap: pageMap.length > 0 ? pageMap : null,
              pdfNumPages: pdfNumPages || null,
              formattedPages: formattedPages, // Save formatted pages
            }

            if (bookIndex >= 0) {
              // Update existing book
              currentLibrary[bookIndex] = bookData
            } else {
              // Add new book
              currentLibrary.push(bookData)
            }

            // Save updated library
            localStorage.setItem("book-library", JSON.stringify(currentLibrary))
            setLibrary(currentLibrary)
          } catch (err) {
            console.error("Error saving progress:", err)
          }
        }
      }

      // Debounce the save operation
      const timeoutId = setTimeout(saveProgress, 1000)
      return () => clearTimeout(timeoutId)
    }
  }, [
    currentPage,
    fileName,
    pages.length,
    content,
    bookmarks,
    notes,
    direction,
    directionMode,
    pdfFileBackup, // Depend on pdfFileBackup
    pageMap,
    pdfNumPages,
    formattedPages, // Depend on formattedPages
  ])

  const loadBookFromLibrary = (book: any) => {
    setContent(book.content)
    const pageArray = splitIntoPages(book.content)
    setPages(pageArray)
    setCurrentPage(book.currentPage || 0)
    setFileName(book.fileName)
    setBookmarks(book.bookmarks || [])
    setNotes(book.notes || {})
    setReadingStats({
      totalPages: pageArray.length,
      pagesRead: book.currentPage || 0,
      readingTime: 0,
    })
    setPdfLoaded(true)
    setShowLibrary(false)
    setDirection(book.direction || "ltr")
    setDirectionMode(book.directionMode || "auto")

    // Load formatted pages from library if available, otherwise reconstruct
    if (book.formattedPages && book.formattedPages.length > 0) {
      setFormattedPages(book.formattedPages)
    } else {
      // Reconstruct formatted pages if not saved (for older library entries)
      setFormattedPages(pageArray.map((page) => page.split(/\s+/).map((word) => ({ text: word, isBold: false }))))
    }

    if (book.pdfFileData && book.pdfFileData.length > 0) {
      // Convert array back to Uint8Array
      const restoredPdfFile = new Uint8Array(book.pdfFileData)
      setPdfFileBackup(book.pdfFileData)
      setPdfFile(restoredPdfFile)
      setPageMap(book.pageMap || [])
      setPdfNumPages(book.pdfNumPages || 0)

      // Re-load the PDF document for rendering
      if (window.pdfjsLib && pdfLoaded) {
        window.pdfjsLib
          .getDocument({ data: restoredPdfFile })
          .promise.then((pdf: any) => {
            setPdfDoc(pdf)
          })
          .catch((err: any) => {
            console.error("[v0] Error loading PDF document from library:", err)
          })
      }
    } else {
      // Reset PDF viewer states for non-PDF books
      setPdfFile(null)
      setPdfFileBackup(null)
      setPageMap([])
      setShowPdfViewer(false)
      setPdfCurrentPage(1)
      setPdfNumPages(0)
      setPdfDoc(null)
    }
    // Load structured notes for the book from library
    if (book.fileName) {
      const loadedNotes = getNotes(book.fileName)
      setStructuredNotes(loadedNotes)
    }
  }

  // Detects if text is likely Hebrew by checking the ratio of Hebrew characters
  // Threshold can be adjusted (currently 30%) - increase for stricter detection, decrease for more lenient
  const isLikelyHebrew = (text: string): boolean => {
    // Hebrew Unicode range: U+0590 to U+05FF
    const hebrewRegex = /[\u0590-\u05FF]/g
    const matches = text.match(hebrewRegex)
    if (!matches) return false

    // Calculate the ratio of Hebrew characters
    const ratio = matches.length / text.length
    // Threshold of 0.3 (30%) - can be adjusted for sensitivity
    // For other RTL languages: Arabic is U+0600-U+06FF, Farsi uses Arabic script
    return ratio > 0.3
  }

  useEffect(() => {
    if (directionMode === "auto" && content) {
      setDirection(isLikelyHebrew(content) ? "rtl" : "ltr")
    } else if (directionMode === "rtl") {
      setDirection("rtl")
    } else if (directionMode === "ltr") {
      setDirection("ltr")
    }
  }, [directionMode, content])

  const renderFormattedText = (segments: TextSegment[]) => {
    return segments.map((segment, index) => {
      if (segment.text === "\n") {
        return <br key={index} />
      }

      if (segment.isBold) {
        return (
          <span key={index} className="font-semibold">
            {segment.text}
          </span>
        )
      }

      return <span key={index}>{segment.text}</span>
    })
  }

  if (!content) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {/* Header */}
        <header className="border-b border-border/50 bg-card/50 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <BookmarkCheck className="w-5 h-5 text-primary-foreground" />
              </div>
              <h1 className="text-xl font-semibold text-foreground">Reader</h1>
            </div>

            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => setDarkMode(!darkMode)} className="rounded-full">
                {darkMode ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
              </Button>

              <Sheet open={showLibrary} onOpenChange={setShowLibrary}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <Library className="w-5 h-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>My Library</SheetTitle>
                  </SheetHeader>
                  <div className="mt-6 space-y-3">
                    {library.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-8">No books in your library yet</p>
                    ) : (
                      library.map((book, idx) => (
                        <div
                          key={idx}
                          className="p-4 rounded-lg border border-border bg-card hover:bg-accent transition-colors cursor-pointer"
                          onClick={() => loadBookFromLibrary(book)}
                        >
                          <p className="font-medium text-sm truncate">{book.fileName}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Page {book.currentPage + 1} of {book.totalPages}
                          </p>
                          <div className="mt-2 w-full bg-secondary rounded-full h-1.5">
                            <div
                              className="bg-primary h-1.5 rounded-full transition-all"
                              style={{ width: `${((book.currentPage + 1) / book.totalPages) * 100}%` }}
                            />
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </SheetContent>
              </Sheet>
            </div>
          </div>
        </header>

        {/* Main upload area */}
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="w-full max-w-md">
            <div className="text-center mb-8">
              <div className="w-20 h-20 rounded-2xl bg-primary/10 mx-auto mb-6 flex items-center justify-center">
                <Upload className="w-10 h-10 text-primary" />
              </div>
              <h2 className="text-3xl font-bold text-foreground mb-3 text-balance">Start Reading</h2>
              <p className="text-muted-foreground text-balance">
                Upload a PDF or text file to begin your reading journey
              </p>
            </div>

            <label className="block">
              <input
                type="file"
                accept=".pdf,.txt"
                onChange={handleFileUpload}
                className="hidden"
                disabled={isLoading}
              />
              <div className="cursor-pointer group">
                <div className="border-2 border-dashed border-border rounded-2xl p-8 text-center hover:border-primary hover:bg-accent/50 transition-all duration-200">
                  <Upload className="w-12 h-12 text-muted-foreground group-hover:text-primary mx-auto mb-4 transition-colors" />
                  <p className="text-sm font-medium text-foreground mb-1">Click to upload</p>
                  <p className="text-xs text-muted-foreground">PDF or TXT files supported</p>
                </div>
              </div>
            </label>

            {isLoading && (
              <div className="mt-6 space-y-3">
                <Progress value={loadingProgress} className="h-2" />
                <p className="text-sm text-center text-muted-foreground">Loading your book... {loadingProgress}%</p>
              </div>
            )}

            {error && (
              <div className="mt-6 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-sm text-destructive text-center">{error}</p>
              </div>
            )}

            {/* Stats cards */}
            <div className="mt-12 grid grid-cols-2 gap-4">
              

              
            </div>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className={`min-h-screen flex flex-col ${darkMode ? "dark" : ""}`}>
      {/* Floating header with book info */}
      <header className="border-b border-border/50 bg-card/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Button variant="ghost" size="icon" onClick={resetReader} className="rounded-full shrink-0">
              <Home className="w-4 h-4" />
            </Button>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground truncate">{fileName}</p>
              <p className="text-xs text-muted-foreground">
                Page {currentPage + 1} of {pages.length}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setShowSearch(true)} className="rounded-full">
              <Search className="w-4 h-4" />
            </Button>

            <Button variant="ghost" size="icon" onClick={toggleBookmark} className="rounded-full">
              {bookmarks.includes(currentPage) ? (
                <BookmarkCheck className="w-4 h-4 text-primary fill-primary" />
              ) : (
                <Bookmark className="w-4 h-4" />
              )}
            </Button>

            <Sheet open={showSettings} onOpenChange={setShowSettings}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <Settings className="w-4 h-4" />
                </Button>
              </SheetTrigger>
              {/* Settings Modal */}
              <Dialog open={showSettings} onOpenChange={setShowSettings}>
                <DialogContent className="max-w-md max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Settings className="w-5 h-5" />
                      Reader Settings
                    </DialogTitle>
                  </DialogHeader>
                  {/* Start of Tabs component */}
                  <Tabs defaultValue="settings" className="space-y-6 pt-4">
                    

                    <TabsContent value="settings">
                      <div className="space-y-6">
                        {/* Text direction control */}
                        <div>
                          <label className="text-sm font-medium mb-3 block">Text Direction</label>
                          <div className="flex gap-2">
                            <Button
                              variant={directionMode === "auto" ? "default" : "outline"}
                              size="sm"
                              onClick={() => setDirectionMode("auto")}
                              className="flex-1"
                            >
                              Auto
                            </Button>
                            <Button
                              variant={directionMode === "ltr" ? "default" : "outline"}
                              size="sm"
                              onClick={() => setDirectionMode("ltr")}
                              className="flex-1"
                            >
                              LTR
                            </Button>
                            <Button
                              variant={directionMode === "rtl" ? "default" : "outline"}
                              size="sm"
                              onClick={() => setDirectionMode("rtl")}
                              className="flex-1"
                            >
                              RTL
                            </Button>
                          </div>
                          <p className="text-xs text-muted-foreground mt-2">
                            Auto detects Hebrew text. Use LTR for English, RTL for Hebrew/Arabic.
                          </p>
                        </div>

                        <div>
                          <label className="text-sm font-medium mb-3 block">Font Size: {fontSize}px</label>
                          <Slider
                            value={[fontSize]}
                            onValueChange={(v) => setFontSize(v[0])}
                            min={14}
                            max={28}
                            step={1}
                          />
                        </div>

                        <div>
                          <label className="text-sm font-medium text-foreground mb-3 block">
                            Words Per Page: {wordsPerPage}
                          </label>
                          <Slider
                            value={[wordsPerPage]}
                            onValueChange={(value) => {
                              setWordsPerPage(value[0])
                              const newPages = splitIntoPages(content)
                              setPages(newPages)
                              setCurrentPage(0)
                              // Re-split formatted pages based on new wordsPerPage
                              const wordsInSegments = formattedPages.flat()
                              const pagesWithFormatting: TextSegment[][] = []
                              let currentPageSegments: TextSegment[] = []
                              let wordCount = 0
                              for (const segment of wordsInSegments) {
                                const segmentWords = segment.text.split(/\s+/).filter((w) => w.length > 0)
                                if (wordCount + segmentWords.length > value[0] && currentPageSegments.length > 0) {
                                  pagesWithFormatting.push(currentPageSegments)
                                  currentPageSegments = []
                                  wordCount = 0
                                }
                                currentPageSegments.push(segment)
                                wordCount += segmentWords.length
                              }
                              if (currentPageSegments.length > 0) {
                                pagesWithFormatting.push(currentPageSegments)
                              }
                              setFormattedPages(pagesWithFormatting)
                            }}
                            min={50}
                            max={300}
                            step={10}
                            className="w-full"
                          />
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-3">
                            <label className="text-sm font-medium text-foreground">Auto-Advance</label>
                            <Button
                              variant={autoAdvance ? "default" : "outline"}
                              size="sm"
                              onClick={() => setAutoAdvance(!autoAdvance)}
                              className="rounded-full"
                            >
                              {autoAdvance ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                            </Button>
                          </div>
                          {autoAdvance && (
                            <div>
                              <p className="text-xs text-muted-foreground mb-2">Speed: {autoAdvanceSpeed}s per page</p>
                              <Slider
                                value={[autoAdvanceSpeed]}
                                onValueChange={(value) => setAutoAdvanceSpeed(value[0])}
                                min={3}
                                max={30}
                                step={1}
                                className="w-full"
                              />
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-between pt-4 border-t border-border">
                          <label className="text-sm font-medium text-foreground">Theme</label>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => setDarkMode(!darkMode)}
                            className="rounded-full"
                          >
                            {darkMode ? (
                              <>
                                <Sun className="w-4 h-4 mr-2" />
                                Light
                              </>
                            ) : (
                              <>
                                <Moon className="w-4 h-4 mr-2" />
                                Dark
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="goals" className="space-y-6 mt-6">
                      <div>
                        <label className="text-sm font-medium text-foreground mb-3 block">Daily Reading Goal</label>
                        <Input
                          type="number"
                          value={dailyGoal}
                          onChange={(e) => setDailyGoal(Number.parseInt(e.target.value) || 20)}
                          className="w-full"
                        />
                        <p className="text-xs text-muted-foreground mt-2">Pages to read each day</p>
                      </div>

                      <div className="p-4 rounded-lg bg-muted">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">Today's Progress</span>
                          <span className="text-sm text-muted-foreground">
                            {todayPages}/{dailyGoal}
                          </span>
                        </div>
                        <Progress value={(todayPages / dailyGoal) * 100} className="h-2" />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 rounded-lg bg-card border border-border">
                          <p className="text-2xl font-bold text-primary">{streak}</p>
                          <p className="text-xs text-muted-foreground mt-1">Day Streak</p>
                        </div>
                        <div className="p-4 rounded-lg bg-card border border-border">
                          <p className="text-2xl font-bold text-primary">{achievements.length}</p>
                          <p className="text-xs text-muted-foreground mt-1">Achievements</p>
                        </div>
                      </div>
                    </TabsContent>

                    <TabsContent value="stats" className="space-y-6 mt-6">
                      <div className="space-y-4">
                        <div className="p-4 rounded-lg bg-card border border-border">
                          <p className="text-sm text-muted-foreground mb-1">Pages Read</p>
                          <p className="text-2xl font-bold text-foreground">
                            {readingStats.pagesRead} / {readingStats.totalPages}
                          </p>
                          <Progress
                            value={(readingStats.pagesRead / readingStats.totalPages) * 100}
                            className="h-1.5 mt-3"
                          />
                        </div>

                        <div className="p-4 rounded-lg bg-card border border-border">
                          <p className="text-sm text-muted-foreground mb-1">Reading Time</p>
                          <p className="text-2xl font-bold text-foreground">
                            {Math.floor(readingStats.readingTime / 60)} min
                          </p>
                        </div>

                        <div className="p-4 rounded-lg bg-card border border-border">
                          <p className="text-sm text-muted-foreground mb-1">Bookmarks</p>
                          <p className="text-2xl font-bold text-foreground">{bookmarks.length}</p>
                        </div>

                        <div className="p-4 rounded-lg bg-card border border-border">
                          <p className="text-sm text-muted-foreground mb-1">Notes</p>
                          <p className="text-2xl font-bold text-foreground">{Object.keys(notes).length}</p>
                        </div>
                      </div>
                    </TabsContent>
                  </Tabs>
                </DialogContent>
              </Dialog>
            </Sheet>
          </div>
        </div>
      </header>

      {/* Main reading area */}
      <main className="flex-1 overflow-y-auto px-4 py-8" ref={readingAreaRef}>
        <div className="max-w-3xl mx-auto" dir={direction}>
          <AnimatePresence mode="wait">
            <motion.p
              key={currentPage}
              initial={{ opacity: 0, x: pageDirection === "next" ? 20 : -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: pageDirection === "next" ? -20 : 20 }}
              transition={{ duration: 0.3, ease: "easeInOut" }}
              className={`text-foreground leading-relaxed text-balance ${
                direction === "rtl" ? "text-right" : "text-left"
              }`}
              style={{
                fontSize: `${fontSize}px`,
                lineHeight: 1.6,
                letterSpacing: "0.01em",
                fontFamily: 'Georgia, "Times New Roman", serif',
              }}
              // Add data attribute for potential note highlighting
              data-note-page={currentPage}
            >
              {formattedPages[currentPage] && formattedPages[currentPage].length > 0
                ? renderFormattedText(formattedPages[currentPage])
                : highlightedMatch && highlightedMatch.page === currentPage
                  ? highlightText(pages[currentPage], highlightedMatch.text)
                  : pages[currentPage]}
            </motion.p>
          </AnimatePresence>

          {notes[currentPage] && (
            <div className="mt-8 p-4 rounded-lg bg-accent/50 border border-border">
              <div className="flex items-start gap-2">
                <StickyNote className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground mb-1">Your Note</p>
                  <p className="text-sm text-muted-foreground leading-relaxed">{notes[currentPage]}</p>
                </div>
              </div>
            </div>
          )}

          {pdfFile && pageMap.length > 0 && (
            <div className="mt-8 flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={goToOriginalPdf}
                className="rounded-full gap-2 bg-transparent"
              >
                <FileText className="w-4 h-4" />
                View in Original PDF
              </Button>
            </div>
          )}
        </div>
      </main>

      {/* Bottom navigation */}
      <footer className="border-t border-border/50 bg-card/80 backdrop-blur-md sticky bottom-0">
        <div className="max-w-4xl mx-auto px-4 py-3">
          <div dir="ltr" className="flex items-center justify-between gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={goToPrevPage}
              disabled={currentPage === 0}
              className="rounded-full"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              {direction === "rtl" ? "הקודם" : "Previous"}
            </Button>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCurrentNote(notes[currentPage] || "")
                  setShowNoteModal(true)
                }}
                className="rounded-full"
              >
                <StickyNote className="w-4 h-4" />
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowNotesPanel(true)}
                className="rounded-full relative"
              >
                <FileText className="w-4 h-4" />
                {structuredNotes.length > 0 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full h-4 w-4 flex items-center justify-center">
                    {structuredNotes.length}
                  </span>
                )}
              </Button>

              <div className="px-3 py-1.5 rounded-full bg-muted text-sm font-medium">
                {currentPage + 1} / {pages.length}
              </div>
            </div>

            <Button
              variant="ghost"
              size="sm"
              onClick={goToNextPage}
              disabled={currentPage >= pages.length - 1}
              className="rounded-full"
            >
              {direction === "rtl" ? "הבא" : "Next"}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>

          {/* Progress bar */}
          <Progress value={((currentPage + 1) / pages.length) * 100} className="h-1 mt-3" />
        </div>
      </footer>

      {/* Search dialog */}
      <Dialog open={showSearch && !isSearchClosing} onOpenChange={setShowSearch}>
        <DialogContent className="transition-all duration-300 ease-out">
          <DialogHeader>
            <DialogTitle>Search</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search in book..."
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="flex-1"
              />
              <Button onClick={handleSearch}>
                <Search className="w-4 h-4" />
              </Button>
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                <p className="text-sm text-muted-foreground">Found {searchResults.length} results</p>
                {searchResults.map((pageNum) => (
                  <button
                    key={pageNum}
                    onClick={() => goToSearchResult(pageNum)}
                    className="w-full text-left p-3 rounded-lg hover:bg-accent transition-all duration-200 border border-border hover:border-primary/50 hover:shadow-sm active:scale-[0.98]"
                  >
                    <p className="text-sm font-medium text-foreground">Page {pageNum + 1}</p>
                    <p className="text-xs text-muted-foreground truncate mt-1">
                      {pages[pageNum] ? pages[pageNum].substring(0, 100) : "No preview available"}...
                    </p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Note dialog */}
      <Dialog open={showNoteModal} onOpenChange={setShowNoteModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Note</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Textarea
              value={currentNote}
              onChange={(e) => setCurrentNote(e.target.value)}
              placeholder="Write your thoughts about this page..."
              rows={5}
            />
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setShowNoteModal(false)}>
                Cancel
              </Button>
              <Button onClick={saveNote}>Save Note</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={showPdfViewer} onOpenChange={setShowPdfViewer}>
        <DialogContent className="max-w-4xl max-h-[90vh] p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="flex items-center justify-between">
              <span>Original PDF - {fileName}</span>
              <span className="text-sm font-normal text-muted-foreground">
                Viewing PDF page {pdfCurrentPage} (matches your reading position)
              </span>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 overflow-hidden p-6">
            <PdfZoomContainer
              canvasRef={pdfCanvasRef}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              defaultZoom={DEFAULT_ZOOM}
            />

            <div className="flex items-center justify-center gap-4 mt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (pdfCurrentPage > 1) {
                    setPdfCurrentPage(pdfCurrentPage - 1)
                  }
                }}
                disabled={pdfCurrentPage <= 1}
                className="rounded-full"
              >
                <ChevronLeft className="w-4 h-4 mr-1" />
                Previous
              </Button>

              <span className="text-sm font-medium px-4 py-2 rounded-full bg-muted">
                Page {pdfCurrentPage} of {pdfNumPages}
              </span>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (pdfCurrentPage < pdfNumPages) {
                    setPdfCurrentPage(pdfCurrentPage + 1)
                  }
                }}
                disabled={pdfCurrentPage >= pdfNumPages}
                className="rounded-full"
              >
                Next
                <ChevronRight className="w-4 h-4 ml-1" />
              </Button>
            </div>

            <Button variant="default" size="sm" onClick={() => setShowPdfViewer(false)} className="rounded-full">
              Back to Text Reader
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <NotesPanel
        isOpen={showNotesPanel}
        onClose={() => setShowNotesPanel(false)}
        notes={structuredNotes}
        onNoteSelected={handleNoteSelected}
        onNotesChanged={handleNotesChanged}
      />
    </div>
  )
}
