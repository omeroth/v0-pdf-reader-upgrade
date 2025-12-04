"use client"

import type React from "react"

import { X, FileText } from "lucide-react"
import { Button } from "./ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet"
import { type Note, deleteNote } from "@/lib/notes"

interface NotesPanelProps {
  isOpen: boolean
  onClose: () => void
  notes: Note[]
  onNoteSelected: (note: Note) => void
  onNotesChanged: () => void
}

export function NotesPanel({ isOpen, onClose, notes, onNoteSelected, onNotesChanged }: NotesPanelProps) {
  const handleDeleteNote = (noteId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (confirm("Delete this note?")) {
      deleteNote(noteId)
      onNotesChanged()
    }
  }

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <FileText className="w-5 h-5" />
            Notes ({notes.length})
          </SheetTitle>
        </SheetHeader>

        <div className="mt-6">
          {notes.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
              <p className="text-sm text-muted-foreground">No notes yet</p>
              <p className="text-xs text-muted-foreground mt-1">Tap the note icon while reading to add notes</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {notes.map((note) => (
                <li
                  key={note.id}
                  className="py-3 px-2 hover:bg-accent rounded-lg cursor-pointer transition-colors group"
                  onClick={() => onNoteSelected(note)}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="text-xs text-muted-foreground">Page {note.pageIndex + 1}</div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => handleDeleteNote(note.id, e)}
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>

                  {note.snippet && (
                    <div className="italic text-muted-foreground text-xs mb-1 line-clamp-1">"{note.snippet}"</div>
                  )}

                  <div className="text-sm leading-relaxed">{note.text}</div>

                  <div className="text-xs text-muted-foreground mt-1">
                    {new Date(note.createdAt).toLocaleDateString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
