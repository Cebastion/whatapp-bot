function extractText(m) {
    const msg = m.message
    if (!msg) return ''
    return (
        msg.conversation ||
        msg.extendedTextMessage?.text ||
        msg.imageMessage?.caption ||
        msg.videoMessage?.caption ||
        ''
    )
}

export { extractText }