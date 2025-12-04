export type Note = {
  id: string
  bookId: string
  pageIndex: number
  text: string
  snippet?: string
  createdAt: string
}

export function getNotes(bookId: string): Note[] {
  if (typeof window === "undefined") return []

  try {
    const notesData = localStorage.getItem("book-notes")
    if (!notesData) return []

    const allNotes: Note[] = JSON.parse(notesData)
    return allNotes.filter((note) => note.bookId === bookId)
  } catch (err) {
    console.error("Error loading notes:", err)
    return []
  }
}

export function saveNote(note: Note): void {
  if (typeof window === "undefined") return

  try {
    const notesData = localStorage.getItem("book-notes")
    const allNotes: Note[] = notesData ? JSON.parse(notesData) : []

    // Check if note already exists (update scenario)
    const existingIndex = allNotes.findIndex((n) => n.id === note.id)
    if (existingIndex >= 0) {
      allNotes[existingIndex] = note
    } else {
      allNotes.push(note)
    }

    localStorage.setItem("book-notes", JSON.stringify(allNotes))
  } catch (err) {
    console.error("Error saving note:", err)
  }
}

export function deleteNote(noteId: string): void {
  if (typeof window === "undefined") return

  try {
    const notesData = localStorage.getItem("book-notes")
    if (!notesData) return

    const allNotes: Note[] = JSON.parse(notesData)
    const filtered = allNotes.filter((n) => n.id !== noteId)
    localStorage.setItem("book-notes", JSON.stringify(filtered))
  } catch (err) {
    console.error("Error deleting note:", err)
  }
}

// Migration function to convert old notes format to new format
export function migrateOldNotes(bookId: string, oldNotes: Record<number, string>): Note[] {
  return Object.entries(oldNotes).map(([pageIndex, text]) => ({
    id: `${bookId}-${pageIndex}-${Date.now()}`,
    bookId,
    pageIndex: Number.parseInt(pageIndex),
    text,
    createdAt: new Date().toISOString(),
  }))
}
