import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ status: "ok", db: "connected", ts: Date.now() })
  } catch {
    return NextResponse.json({ status: "ok", db: "disconnected", ts: Date.now() }, { status: 200 })
  }
}
