import { notFound } from "next/navigation";
import Link from "next/link";
import { requirePageSession } from "@/lib/session";
import { getDashboardData } from "@/lib/google/sheets";
import { deriveAssigneeOptions } from "@/lib/leads";
import { getSharedAccountKey } from "@/lib/actingAs";
import ScoreBadge from "@/components/ScoreBadge";
import StatusSelect from "@/components/StatusSelect";
import CallToggle from "@/components/CallToggle";
import MemoField from "@/components/MemoField";
import AssigneeField from "@/components/AssigneeField";
import EnrichButton from "@/components/EnrichButton";
import DeleteLeadButton from "@/components/DeleteLeadButton";

export default async function LeadDetailPage(props: PageProps<"/leads/[id]">) {
  const { id } = await props.params;
  const session = await requirePageSession();
  const accessToken = session.accessToken;

  const { leads } = await getDashboardData(accessToken);
  const lead = leads.find((l) => l.id === id) ?? null;
  if (!lead) notFound();
  const assigneeOptions = deriveAssigneeOptions(leads);

  // シェアレジ担当者はこのページでもシェアレジメモの入力のみ行う。オンコール営業側の
  // 記録（フェーズ・架電日・担当者・架電メモ）とリード削除・リサーチは閲覧専用/非表示にする。
  const isShareRegi = session?.user?.email ? getSharedAccountKey(session.user.email) === "shareregi" : false;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/" className="text-sm text-foreground/50 hover:text-brand">
          ← ダッシュボードに戻る
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{lead.医療機関名}</h1>
            <p className="mt-1 text-sm text-foreground/60">
              {lead.種別} ・ {lead.地域}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isShareRegi ? (
              <span className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground/60">
                {lead.ステータス || "未活動"}
                {lead.架電日 && <span className="ml-2 text-foreground/40">架電: {lead.架電日}</span>}
              </span>
            ) : (
              <>
                <StatusSelect leadId={lead.id} status={lead.ステータス} />
                <CallToggle leadId={lead.id} calledAt={lead.架電日} />
              </>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-1">
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <h2 className="mb-3 font-bold">基本情報</h2>
            <dl className="flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between gap-4">
                <dt className="text-foreground/50">担当者</dt>
                <dd>
                  {isShareRegi ? (
                    <span className="font-medium">{lead.担当者 || "未設定"}</span>
                  ) : (
                    <AssigneeField leadId={lead.id} assignee={lead.担当者} options={assigneeOptions} />
                  )}
                </dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-foreground/50">電話番号</dt>
                <dd className="font-medium">{lead.電話番号 || "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-foreground/50">住所</dt>
                <dd className="text-right font-medium">{lead.住所 || "—"}</dd>
              </div>
              {lead.地域特徴 && (
                <div className="flex justify-between gap-4">
                  <dt className="shrink-0 text-foreground/50">地域特徴</dt>
                  <dd className="text-right text-foreground/80">{lead.地域特徴}</dd>
                </div>
              )}
              <div className="flex justify-between gap-4">
                <dt className="text-foreground/50">メール</dt>
                <dd className="font-medium">{lead.メールアドレス || "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-foreground/50">登録日</dt>
                <dd className="font-medium">{lead.登録日?.slice(0, 10) || "—"}</dd>
              </div>
              {lead.架電日 && (
                <div className="flex justify-between gap-4">
                  <dt className="text-foreground/50">架電</dt>
                  <dd className="text-right font-medium">
                    {lead.架電日}
                    {lead.架電者 && (
                      <span className="block text-xs font-normal text-foreground/50">
                        {lead.架電者}
                      </span>
                    )}
                  </dd>
                </div>
              )}
              {lead.情報ソースURL && (
                <div className="flex justify-between gap-4">
                  <dt className="text-foreground/50">情報ソース</dt>
                  <dd className="max-w-[60%] truncate text-right">
                    <a
                      href={lead.情報ソースURL}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand hover:underline"
                    >
                      リンク
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <h2 className="mb-3 font-bold">スコア</h2>
            <div className="flex flex-col gap-2">
              <ScoreBadge label="適合度" score={Number(lead.適合度スコア || 0)} />
              <ScoreBadge label="規模" score={Number(lead.規模スコア || 0)} />
              <ScoreBadge label="地域" score={Number(lead.地域スコア || 0)} />
            </div>
            <p className="mt-3 text-sm text-foreground/60">
              総合スコア: <span className="font-bold text-brand">{lead.総合スコア || "—"}</span>
            </p>
            {lead.事業内容メモ && (
              <p className="mt-3 border-t border-border pt-3 text-xs leading-relaxed text-foreground/60">
                {lead.事業内容メモ}
              </p>
            )}
          </div>

          <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <h2 className="mb-3 font-bold">メモ</h2>
            <MemoField leadId={lead.id} memo={lead.メモ} field="memo" placeholder="架電メモを入力" readOnly={isShareRegi} />
          </div>

          <div className="rounded-2xl border border-violet-200 bg-violet-50/30 p-5 shadow-sm">
            <h2 className="mb-3 font-bold text-violet-700">シェアレジメモ</h2>
            <MemoField
              leadId={lead.id}
              memo={lead.シェアレジメモ}
              field="shareRegiMemo"
              placeholder="シェアレジの架電メモを入力"
            />
          </div>

          {!isShareRegi && <DeleteLeadButton leadId={lead.id} />}
        </div>

        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">リサーチ</h2>
              {!isShareRegi && <EnrichButton leadId={lead.id} />}
            </div>
            {lead.事業内容メモ ? (
              <p className="mt-4 whitespace-pre-wrap rounded-xl border border-border bg-brand-light/40 p-4 text-sm leading-relaxed text-foreground/80">
                {lead.事業内容メモ}
              </p>
            ) : (
              <p className="mt-4 rounded-xl border border-dashed border-border p-4 text-sm text-foreground/40">
                まだリサーチ結果はありません。「リサーチする」を押すと院内容の要約が表示されます。
              </p>
            )}
            {lead.地域特徴 && (
              <p className="mt-3 text-xs leading-relaxed text-foreground/50">
                地域特徴: {lead.地域特徴}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
