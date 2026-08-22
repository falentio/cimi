import { useEffect, useState } from 'react'
import { createClient } from '@cimi/client'
import { Badge } from '@cloudflare/kumo/components/badge'

export default function HealthStatus() {
  const [state, setState] = useState<string>('loading')
  useEffect(() => {
    const client = createClient({ baseUrl: '' })
    client.system
      .health()
      .then((r) => setState(r.status))
      .catch(() => setState('error'))
  }, [])
  return <Badge>{`cimi: ${state}`}</Badge>
}
