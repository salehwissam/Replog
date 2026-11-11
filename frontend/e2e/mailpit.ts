const MAILPIT = 'http://localhost:8025/api/v1'

interface MailSummary {
  ID: string
  To: { Address: string }[]
  Subject: string
}

export async function waitForToken(to: string, subjectPart: string, timeoutMs = 15_000): Promise<string> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const res = await fetch(`${MAILPIT}/search?query=${encodeURIComponent(`to:${to}`)}`)
    if (res.ok) {
      const data = (await res.json()) as { messages: MailSummary[] }
      const msg = data.messages.find((m) => m.Subject.includes(subjectPart))
      if (msg) {
        const full = (await (await fetch(`${MAILPIT}/message/${msg.ID}`)).json()) as { Text: string }
        const match = /#token=([A-Za-z0-9_-]+)/.exec(full.Text)
        if (match?.[1]) return match[1]
      }
    }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error(`Nenhum e-mail "${subjectPart}" para ${to}`)
}

export async function clearInbox(): Promise<void> {
  await fetch(`${MAILPIT}/messages`, { method: 'DELETE' })
}
