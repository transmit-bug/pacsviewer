import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, User, FileText, Image, Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { patientApi, studyApi, reportApi } from '@/services/api'

interface SearchResult {
  id: string
  type: 'patient' | 'study' | 'report'
  title: string
  subtitle: string
  href: string
}

export function GlobalSearch() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((open) => !open)
      }
    }
    document.addEventListener('keydown', down)
    return () => document.removeEventListener('keydown', down)
  }, [])

  const handleSearch = useCallback(async (searchQuery: string) => {
    if (!searchQuery.trim()) {
      setResults([])
      return
    }

    setLoading(true)
    try {
      const [patientsRes, studiesRes, reportsRes] = await Promise.allSettled([
        patientApi.getAll({ search: searchQuery, limit: 3 }),
        studyApi.getAll({ search: searchQuery, limit: 3 }),
        reportApi.getAll({ search: searchQuery, limit: 3 }),
      ])

      const results: SearchResult[] = []

      if (patientsRes.status === 'fulfilled' && patientsRes.value.data?.items) {
        results.push(
          ...patientsRes.value.data.items.map((p: any) => ({
            id: p.id,
            type: 'patient' as const,
            title: p.name,
            subtitle: p.mrn || p.phone || '',
            href: `/patients/${p.id}`,
          }))
        )
      }

      if (studiesRes.status === 'fulfilled' && studiesRes.value.data?.items) {
        results.push(
          ...studiesRes.value.data.items.map((s: any) => ({
            id: s.id,
            type: 'study' as const,
            title: s.description || s.studyInstanceUid,
            subtitle: s.modality || '',
            href: `/viewer/${s.id}`,
          }))
        )
      }

      if (reportsRes.status === 'fulfilled' && reportsRes.value.data?.items) {
        results.push(
          ...reportsRes.value.data.items.map((r: any) => ({
            id: r.id,
            type: 'report' as const,
            title: r.title || `报告 ${r.id.slice(0, 8)}`,
            subtitle: r.status || '',
            href: `/reports/${r.id}`,
          }))
        )
      }

      setResults(results)
    } catch (error) {
      console.error('Search failed:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => {
      handleSearch(query)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, handleSearch])

  const handleSelect = (result: SearchResult) => {
    navigate(result.href)
    setOpen(false)
    setQuery('')
  }

  const getIcon = (type: string) => {
    switch (type) {
      case 'patient':
        return <User className="h-4 w-4" />
      case 'study':
        return <Image className="h-4 w-4" />
      case 'report':
        return <FileText className="h-4 w-4" />
      default:
        return <Search className="h-4 w-4" />
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 items-center rounded-md border border-input bg-background px-3 text-sm text-muted-foreground hover:bg-accent hover:text-accent-foreground transition-colors"
      >
        <Search className="mr-2 h-4 w-4" />
        <span className="hidden sm:inline">搜索...</span>
        <kbd className="pointer-events-none ml-2 hidden h-5 select-none items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium sm:flex">
          <span className="text-xs">⌘</span>K
        </kbd>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>搜索</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Input
              placeholder="搜索患者、检查、报告..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {loading && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span className="text-sm text-muted-foreground">搜索中...</span>
              </div>
            )}
            {!loading && results.length > 0 && (
              <div className="space-y-1">
                {results.map((result) => (
                  <button
                    key={`${result.type}-${result.id}`}
                    onClick={() => handleSelect(result)}
                    className="flex w-full items-center space-x-3 rounded-md p-2 text-left hover:bg-accent transition-colors"
                  >
                    <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                      {getIcon(result.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{result.title}</p>
                      <p className="text-xs text-muted-foreground truncate">{result.subtitle}</p>
                    </div>
                    <span className="text-xs text-muted-foreground capitalize">
                      {result.type === 'patient' ? '患者' : result.type === 'study' ? '检查' : '报告'}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {!loading && query && results.length === 0 && (
              <div className="text-center py-8 text-sm text-muted-foreground">
                未找到相关结果
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
