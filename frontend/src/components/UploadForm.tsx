import { useState, useRef } from 'react'
import { postScores } from '../api/ingest'
import { Button } from '@/components/ui/button'
import type { IngestResult } from '../types'

interface Props {
  onSuccess: (result: IngestResult) => void
}

export default function UploadForm({ onSuccess }: Props) {
  const [files, setFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrors([])
    setLoading(true)
    try {
      const contents = await Promise.all(files.map((f) => f.text()))
      const result = await postScores(contents)
      onSuccess(result)
      setFiles([])
      if (inputRef.current) inputRef.current.value = ''
    } catch (err) {
      setErrors((err as Error).message.split('\n'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="csv-files" className="mb-1.5 block text-sm font-medium">
          CSV Files
        </label>
        <input
          id="csv-files"
          ref={inputRef}
          type="file"
          multiple
          accept=".csv,text/csv"
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          className="block w-full rounded border border-input bg-background px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm hover:file:bg-muted/80"
        />
        {files.length > 0 && (
          <p className="mt-1 text-xs text-muted-foreground">{files.length} file(s) selected</p>
        )}
      </div>

      {errors.length > 0 && (
        <ul className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {errors.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}

      <Button type="submit" disabled={files.length === 0 || loading}>
        {loading ? 'Uploading…' : 'Upload'}
      </Button>
    </form>
  )
}
