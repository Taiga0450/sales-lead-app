import { NextResponse } from "next/server";
import { requireSession } from "@/lib/session";
import { createDealTask, TASK_TYPES, TASK_PRIORITIES, type DealTaskType, type DealTaskPriority } from "@/lib/hubspot";

interface TaskBody {
  subject?: string;
  body?: string;
  dueAt?: string;
  taskType?: DealTaskType;
  priority?: DealTaskPriority;
  ownerId?: string;
}

/**
 * 商談報告×Hubspot画面の「HubSpotタスクを追加」用。dealIdはHubSpot上の取引IDそのもの
 * （source: "hubspot" の商談のみが対象——シートのみの商談にはHubSpotの取引が存在しない）。
 */
export async function POST(request: Request, ctx: RouteContext<"/api/deal-report/[id]/task">) {
  const { id } = await ctx.params;

  try {
    await requireSession();
  } catch {
    return NextResponse.json({ error: "認証が必要です" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as TaskBody;
  const subject = body.subject?.trim();
  if (!subject) {
    return NextResponse.json({ error: "タスク内容を入力してください" }, { status: 400 });
  }
  if (!body.dueAt) {
    return NextResponse.json({ error: "期日を入力してください" }, { status: 400 });
  }
  if (!body.taskType || !TASK_TYPES.includes(body.taskType)) {
    return NextResponse.json({ error: "不正なタスクタイプです" }, { status: 400 });
  }
  if (!body.priority || !TASK_PRIORITIES.includes(body.priority)) {
    return NextResponse.json({ error: "不正な優先度です" }, { status: 400 });
  }
  if (!body.ownerId) {
    return NextResponse.json({ error: "担当者を選択してください" }, { status: 400 });
  }

  try {
    const task = await createDealTask(id, {
      subject,
      body: body.body?.trim() ?? "",
      dueAt: body.dueAt,
      taskType: body.taskType,
      priority: body.priority,
      ownerId: body.ownerId,
    });
    return NextResponse.json({ task });
  } catch (error) {
    console.error(error);
    const detail = error instanceof Error ? error.message.slice(0, 300) : "";
    return NextResponse.json({ error: `タスクの作成に失敗しました${detail ? `: ${detail}` : ""}` }, { status: 500 });
  }
}
