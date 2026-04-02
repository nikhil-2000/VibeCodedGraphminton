import { useState } from 'react'
import UploadForm from '../components/UploadForm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { IngestResult } from '../types'

export default function UploadPage() {
  const [result, setResult] = useState<IngestResult | null>(null)

  return (
    <div className="max-w-lg">
      <h1 className="mb-6 text-2xl font-bold">Upload Scores</h1>
      <p className="mb-6 text-sm text-muted-foreground">
        Upload one or more weekly score CSV files. Each file must contain games from a single date.
        All player names will be resolved against known aliases automatically.
      </p>

      <Card className="mb-6">
        <CardContent className="pt-6">
          <UploadForm onSuccess={(r) => setResult(r)} />
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-green-400">Upload complete</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm">{result.games_loaded} game(s) ingested.</p>
            {result.errors.length > 0 && (
              <div className="mt-3">
                <p className="text-sm font-medium text-yellow-400">Warnings / errors:</p>
                <ul className="mt-1 space-y-1">
                  {result.errors.map((e, i) => (
                    <li key={i} className="text-sm text-destructive">{e}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
