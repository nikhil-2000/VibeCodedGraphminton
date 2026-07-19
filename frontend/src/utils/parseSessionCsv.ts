export interface ParsedGameRow {
  teamARaw: [string, string]
  scoreA: number
  teamBRaw: [string, string]
  scoreB: number
}

export interface ParseResult {
  dateStr: string | null  // "YYYY-MM-DD" or null if unparseable
  games: ParsedGameRow[]
  parseErrors: string[]
}

/**
 * Parse CSV text in format: Date,GameNo,P1,P2,ScoreA,P3,P4,ScoreB
 * One date per file — uses date from first data row.
 */
export function parseSessionCsv(text: string): ParseResult {
  const lines = text.trim().split('\n').filter(Boolean)
  const games: ParsedGameRow[] = []
  const parseErrors: string[] = []
  let dateStr: string | null = null

  const startIdx = lines[0]?.trim().startsWith('Date') ? 1 : 0

  for (let i = startIdx; i < lines.length; i++) {
    const rowNum = i + 1
    const parts = lines[i].split(',').map((s) => s.trim())
    if (parts.length !== 8) {
      parseErrors.push(`Row ${rowNum}: expected 8 columns, got ${parts.length}`)
      continue
    }

    if (dateStr === null) {
      const [day, month, year] = parts[0].split('-')
      if (day && month && year) {
        dateStr = `${year.length === 2 ? '20' + year : year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
      } else {
        parseErrors.push(`Row ${rowNum}: could not parse date "${parts[0]}"`)
      }
    }

    const scoreA = parseInt(parts[4], 10)
    const scoreB = parseInt(parts[7], 10)
    if (isNaN(scoreA)) {
      parseErrors.push(`Row ${rowNum}: invalid score A "${parts[4]}"`)
      continue
    }
    if (isNaN(scoreB)) {
      parseErrors.push(`Row ${rowNum}: invalid score B "${parts[7]}"`)
      continue
    }

    games.push({
      teamARaw: [parts[2], parts[3]],
      scoreA,
      teamBRaw: [parts[5], parts[6]],
      scoreB,
    })
  }

  return { dateStr, games, parseErrors }
}
