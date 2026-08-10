import { useId, useRef, useState, type DragEvent, type KeyboardEvent } from "react"
import { FileUp, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"

interface DataUploadProps {
  kind: string
  label: string
  accept?: string
  multiple?: boolean
  onFiles: (files: File[]) => void
  compact?: boolean
}

export function DataUpload({ kind, label, accept = ".xlsx,.xls,.csv", multiple = false, onFiles, compact = false }: DataUploadProps) {
  const id = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const deliver = (files: FileList | null) => {
    if (!files?.length) return
    onFiles([...files])
    if (inputRef.current) inputRef.current.value = ""
  }
  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setDragging(false)
    deliver(event.dataTransfer.files)
  }
  const keyboard = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      inputRef.current?.click()
    }
  }
  const input = <input ref={inputRef} id={id} type="file" accept={accept} multiple={multiple} className="sr-only" onChange={(event) => deliver(event.target.files)} />

  if (compact) return <>{input}<Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}><Upload aria-hidden="true" />{label}</Button></>

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={`${label} 파일 업로드`}
      data-kind={kind}
      onKeyDown={keyboard}
      onClick={() => inputRef.current?.click()}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true) }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
      className={`flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-[var(--radius)] border border-dashed p-6 text-center outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-[var(--ring)] motion-reduce:transition-none ${dragging ? "border-[var(--primary)] bg-[var(--accent)]" : "border-[var(--border)] bg-[var(--muted)]"}`}
    >
      {input}
      <FileUp aria-hidden="true" className="size-7 text-[var(--primary)]" />
      <strong className="mt-3 text-sm text-[var(--foreground)]">{label}</strong>
      <span className="mt-1 text-xs text-[var(--muted-foreground)]">파일을 여기에 놓거나 파일 선택을 누르세요.</span>
      <Button type="button" variant="outline" size="sm" className="mt-4" tabIndex={-1}>파일 선택</Button>
    </div>
  )
}
