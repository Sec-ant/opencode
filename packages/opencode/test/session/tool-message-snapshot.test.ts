import { describe, expect, test } from "bun:test"

describe("session prompt tool message snapshot", () => {
  test("copies part arrays so transform hooks cannot mutate tool context in place", () => {
    const msgs = [
      {
        info: { id: "msg_1" },
        parts: [{ id: "prt_1", type: "file", filename: "clipboard", url: "data:image/png;base64,abc", mime: "image/png" }],
      },
    ]

    const toolMessages = msgs.map((m) => ({
      ...m,
      parts: [...m.parts],
    }))

    msgs[0]!.parts.length = 0

    expect(msgs[0]!.parts).toHaveLength(0)
    expect(toolMessages[0]!.parts).toHaveLength(1)
    expect(toolMessages[0]!.parts[0]).toMatchObject({
      id: "prt_1",
      filename: "clipboard",
      mime: "image/png",
    })
  })
})
