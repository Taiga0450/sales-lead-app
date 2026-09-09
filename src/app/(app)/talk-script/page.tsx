"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

/**
 * トークスクリプトページのソース:
 * ・「テレアポ 読み上げ用トークスクリプト(改訂版)」(Googleドキュメント、社内共有分)
 * ・ON CALL提案資料(2026年版PDF)の 会社概要/対応3原則/対応エリア/実績 部分
 * 内容が更新された場合は、まず上記の原本を確認したうえでこのページを更新すること。
 */

type ScriptLine = { kind: "script" | "note" | "label"; text: string; indent?: boolean };

type Objection = {
  no: number;
  situation: string;
  lines: ScriptLine[];
};

const FLOW_STEPS = [
  { step: "STEP0", id: "step0", title: "架電前の確認", desc: "担当エリア(関東/大阪)と、直近3ヶ月以内の架電履歴の有無を確認する" },
  { step: "STEP1", id: "step1", title: "受付・新規案内", desc: "受付突破のトーク。エリア・履歴の有無でパターンを使い分ける" },
  { step: "STEP2", id: "step2", title: "断り文句への切り返し", desc: "想定される13パターンの切り返しトーク" },
  { step: "STEP3", id: "step3-4", title: "担当者接続後トーク", desc: "診療報酬改定などを切り口にアポの日程を打診する" },
  { step: "STEP4", id: "step4", title: "アポ獲得時のヒアリング", desc: "訪問/オンラインの確認と共通ヒアリング項目の聴取" },
  { step: "商談", id: "calendar", title: "お打ち合わせ", desc: "ヒアリング内容をもとに商談を実施する" },
  { step: "商談獲得後", id: "calendar", title: "カレンダー登録・契約対応", desc: "Googleカレンダーに予定を登録し、契約手続きへ" },
] as const;

// 架電中に「困った」ときにワンタップで飛べるショートカット一覧。
const SHORTCUTS = [
  { href: "#step2", label: "断られたら(切り返し集)" },
  { href: "#step3-4", label: "担当者に繋がったら" },
  { href: "#pricing", label: "料金を聞かれたら" },
  { href: "#offices", label: "事業所を聞かれたら" },
] as const;

const KANTO_OFFICES_NOTE =
  "東京近郊に5か所拠点があるので、近い所から向かいます。";
const OSAKA_OFFICE_NOTE = "大阪市中央区の拠点から向かいます。";

const OFFICES = [
  { name: "新宿事業所", address: "〒169-0074 東京都新宿区北新宿一丁目28番9号", note: "" },
  { name: "墨田事業所", address: "東京都墨田区東向島二丁目29番11号", note: "千葉エリアまで対応" },
  { name: "国分寺事業所", address: "〒185-0021 東京都国分寺市南町3-23-14", note: "" },
  { name: "横浜事業所", address: "〒227-0043 神奈川県横浜市青葉区藤が丘二丁目37番3号", note: "" },
  { name: "伊勢原事業所", address: "〒259-1132 神奈川県伊勢原市桜台一丁目25番18号", note: "" },
  { name: "埼玉事業所", address: "〒336-0017 埼玉県さいたま市南区南浦和三丁目43番15号", note: "" },
  { name: "大阪事業所", address: "大阪市中央区本町2-4-12", note: "2026年1月開設・大阪全域対応(一部尼崎も対応)" },
] as const;

const STRENGTHS = [
  {
    role: "コールセンタースタッフ",
    title: "全員が現役の看護師",
    desc: "ON CALL受電対応を行うコールセンタースタッフは、全員が現役の看護師です。さらには往診対応を行う医師チームのバックアップするサポート体制を整えているため、患者様への最適な対応から、医療機関様への正確な情報共有が可能となります。",
  },
  {
    role: "往診ディレクター",
    title: "全員が医療従事者",
    desc: "ON CALLで医師に同行し、医師のサポートから患者様やそのご家族へのケアを行う往診ディレクターは、全員が医療従事者です。",
  },
  {
    role: "医師",
    title: "全員が紹介型採用により採用された医師",
    desc: "ON CALLで往診や電話再診を行う医師は、全員がON CALLの目指す在宅医療を理解しているON CALL所属医師による紹介により採用されています。そのため医師による医師へのフィードバックなどもしっかり行っています。",
  },
] as const;

const FIRST_CALL_PLAN = [
  { label: "フル(平日夜間・土日祝日)", value: "患者数×3,000円/月" },
  { label: "夜間のみ", value: "患者数×100円/1コマ" },
  { label: "日中のみ", value: "患者数×150円/1コマ" },
] as const;

const SECOND_CALL_TICKET_PLAN = [
  { label: "月2件コース", value: "100,000円" },
  { label: "月5件コース", value: "225,000円" },
  { label: "月10件コース", value: "400,000円" },
  { label: "超過料金", value: "50,000円/件" },
] as const;

const SECOND_CALL_SPOT_PLAN = [
  { label: "基本料金", value: "10,000円" },
  { label: "従量料金", value: "60,000円/件" },
] as const;

const DOCTOR_FEE_PLAN = [
  { label: "日中(09:00-17:59)", value: "20,000円/往診1件あたり" },
  { label: "夜間①(18:00-21:59)", value: "25,000円/往診1件あたり" },
  { label: "夜間②(22:00-翌05:59)", value: "30,000円/往診1件あたり" },
  { label: "早朝帯(06:00-08:59)", value: "20,000円/往診1件あたり" },
  { label: "電話再診", value: "2,000円/1件あたり" },
  { label: "紹介状作成", value: "2,000円/1件あたり" },
] as const;

const EMERGENCY_CONTACTS = {
  kanto: [
    { name: "森", tel: "070-1495-1428" },
    { name: "富田", tel: "070-6401-6987" },
  ],
  osaka: [{ name: "松本", tel: "080-6756-4779" }],
};

const CALENDAR_GUESTS: Record<"kanto" | "osaka", string[]> = {
  kanto: ["森", "富田"],
  osaka: ["松本", "松長"],
};

const HEARING_ITEMS = [
  "お名前・部署役職",
  "当日資料の必要部数",
  "(本部の方のアポの場合)住所",
  "現在夜間・休日対応の受電はどなたが取っているか(院長／事務／他社)",
  "現在の患者数",
  "使用しているカルテの形式(クラウド／オンプレ)",
  "日程変更や当日の緊急連絡先の伝達",
];

const OBJECTIONS: Objection[] = [
  {
    no: 1,
    situation: "「うちは大丈夫です」",
    lines: [
      {
        kind: "script",
        text: "今は、夜間や休日のお電話はどなたが対応していらっしゃいますか？(先生／看護師／事務など)→料金の変更や事業所も拡大したので30分ほどお時間いただけますでしょうか",
      },
      { kind: "label", text: "▶ それでも断られた場合(マジでいらない場合)" },
      { kind: "script", text: "今後のためにもご挨拶だけでもいかがですか。", indent: true },
      { kind: "label", text: "相手「大丈夫です」↓" },
      { kind: "script", text: "そうですか。では、また日を改めてご連絡させていただきます。失礼します。", indent: true },
    ],
  },
  {
    no: 2,
    situation: "「他社使ってます」",
    lines: [
      {
        kind: "script",
        text: "そうなんですね、弊社の方では全員医療従事者で、料金は同等以下、新規契約の約半数が他社からの切り替えとなっております。料金形態なども変更がございましたので、一度お時間をいただけますと幸いです。",
      },
      { kind: "label", text: "▶ それでも今は不要と言われた場合" },
      {
        kind: "script",
        text: "今は不要かと思いますが、今後ご利用いただく機会があるかと思いますので、来週あたりお時間をいただくことは可能でしょうか。",
        indent: true,
      },
      { kind: "label", text: "▶ 断られた場合" },
      { kind: "script", text: "またご連絡させていただきます。ご担当者様のお名前だけお伺いしてもよろしいですか。", indent: true },
      { kind: "note", text: "他社比較の参考: 当直連携、ファストドクター、CUBE、アイブリー、Okitell365、Nurse24" },
    ],
  },
  {
    no: 3,
    situation: "「新規はHPへ／断るように言われている」",
    lines: [
      { kind: "script", text: "承知いたしました。それでは失礼いたします。" },
      { kind: "note", text: "人材紹介と間違われた場合は「オンコール代行の件です」と補足する。" },
    ],
  },
  {
    no: 4,
    situation: "「不在です」",
    lines: [
      { kind: "script", text: "そうでしたか。お電話に出ていただきやすい時間帯はございますか？" },
      { kind: "label", text: "▶ いつ頃お戻りになりますか。／ご担当者様のお名前だけお伺いしてもよろしいでしょうか。" },
      { kind: "script", text: "後日改めてご連絡させていただきます。お忙しい中ありがとうございます。失礼します。" },
      { kind: "note", text: "再架電を計画する(自分の稼働時間外なら他メンバーへ引き継ぎ可)。" },
    ],
  },
  {
    no: 5,
    situation: "「本部で一括しています」",
    lines: [
      { kind: "script", text: "本部の電話番号を伺えますか？" },
      { kind: "label", text: "(教えてもらえない場合)" },
      { kind: "script", text: "本部というのは医療法人△△でお間違いないでしょうか？", indent: true },
    ],
  },
  {
    no: 6,
    situation: "「夜間休日往診やっていません」",
    lines: [
      { kind: "label", text: "▶ では、夜間休日は誰がお電話のご対応をされているのですか。" },
      { kind: "label", text: "・されていない場合↓" },
      { kind: "script", text: "承知いたしました。お忙しい中ありがとうございます。失礼します。", indent: true },
      {
        kind: "note",
        text: "日中も対応していない場合(在宅医療の届出はあるが往診対応なしのケース): 在宅医療の届出が出ている旨を伝え、患者から往診要望がないか確認し、担当宛てに連絡してよいか許可を取る。→管理表に「在宅医療 未実施」と記録する。",
      },
      { kind: "label", text: "・されている場合↓ 何名で対応されているのですか。" },
      { kind: "label", text: "(1名で対応の場合)↓" },
      {
        kind: "script",
        text: "承知いたしました。弊社は夜間休日など医師が休みたい時間帯に、医師に代わって往診させていただいており、数名体制でやらせていただいています。",
        indent: true,
      },
      { kind: "label", text: "▶ 人が足りている様子の場合" },
      {
        kind: "script",
        text: "今後のためにも一度お話をさせていただいてもよろしいですか。弊社は夜間休日の往診代行を安くご提案しており、人件費などを抑えられます。加えて対応するのは全員現役の看護師ですので、いざという時のご対応も十分にできると思います。",
        indent: true,
      },
    ],
  },
  {
    no: 7,
    situation: "「自院でやっているので大丈夫」",
    lines: [
      {
        kind: "script",
        text: "一部スポット利用も月額1万円からご利用いただけるサービスもございます。資料だけでもお送りさせていただいてよろしいでしょうか。→メールアドレスを伺う",
      },
      { kind: "note", text: "医師が対応の場合／看護師や事務が対応の場合で、それぞれ負担軽減の訴求に展開する。" },
    ],
  },
  {
    no: 8,
    situation: "「別のところへ外注している」",
    lines: [{ kind: "note", text: "他社比較の参考(2.と共通): 当直連携、ファストドクター、CUBE、アイブリー、Okitell365、Nurse24" }],
  },
  {
    no: 9,
    situation: "「土日だけなど曜日固定を希望」",
    lines: [
      { kind: "script", text: "受電対応は曜日固定でのご依頼が可能です(スポット対応は不可)。往診代行はスポット対応も可能です。" },
    ],
  },
  {
    no: 10,
    situation: "「理由の分からないお断り」",
    lines: [
      {
        kind: "script",
        text: "院内で完結されていて、外注や代行のご利用は現時点で全く検討されていないということでしょうか？受電対応のご負担を感じられるケースも多いと伺いますが、外注されない理由などございますか？",
      },
    ],
  },
  {
    no: 11,
    situation: "料金を聞かれた場合",
    lines: [
      {
        kind: "script",
        text: "プランによって異なりますが、平日夜間・土日祝日のフルプランで患者数×3,000円/月になります。直近3ヶ月の往診件数によって固定の基本料金を下げさせていただくので、一度お打ち合わせの機会をいただけますと幸いです。来週あたりご都合のよろしいお時間はございますでしょうか。",
      },
      { kind: "note", text: "金額の断定はせず、状況を伺いながら正式なお見積りを作成する旨を伝える。" },
    ],
  },
  {
    no: 12,
    situation: "最終的にお断りされた場合",
    lines: [
      { kind: "script", text: "また何かアップデートや市場の動きなど共有できればと思います。私は◯◯と申しますがお名前を伺えますか？" },
      { kind: "note", text: "できる限りお名前を伺って終話する。" },
    ],
  },
  {
    no: 13,
    situation: "担当者に取り次げず、伝言を頼まれた場合",
    lines: [
      {
        kind: "script",
        text: "◯◯区の対応強化(または新拠点開設)のご挨拶のご連絡でした。よろしくお伝えいただけますでしょうか。最後にご担当者様のお名前だけお伺いしてもよろしいですか。",
      },
      { kind: "label", text: "▶ 名前を確認できたら↓" },
      { kind: "script", text: "ありがとうございます。またご連絡させていただきます。失礼します。", indent: true },
      { kind: "note", text: "院長など決裁者への取り次ぎを頼まれた場合も同様の流れで対応する。" },
    ],
  },
];

function ScriptBox({ children, indent }: { children: React.ReactNode; indent?: boolean }) {
  return (
    <p
      className={`rounded-lg border border-brand/30 bg-brand-light/60 px-4 py-2.5 text-sm leading-relaxed text-foreground ${
        indent ? "ml-4" : ""
      }`}
    >
      {children}
    </p>
  );
}

function NoteLine({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-relaxed text-foreground/50">{children}</p>;
}

function LabelLine({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-foreground/60">{children}</p>;
}

function SectionHeading({ id, eyebrow, title }: { id: string; eyebrow: string; title: string }) {
  return (
    <div id={id} className="scroll-mt-24">
      <p className="text-xs font-semibold tracking-wide text-brand">{eyebrow}</p>
      <h2 className="mt-1 text-xl font-bold">{title}</h2>
    </div>
  );
}

type FooterLink = { href: string; label: string; variant?: "primary" | "secondary" };

function StepFooterNav({ links }: { links: FooterLink[] }) {
  if (links.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
      {links.map((l) => (
        <a
          key={l.href + l.label}
          href={l.href}
          className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition ${
            l.variant === "secondary"
              ? "border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100"
              : "bg-brand text-white hover:bg-brand/90"
          }`}
        >
          {l.label} ↓
        </a>
      ))}
    </div>
  );
}

// 架電中はスクロール位置に関係なくワンタップで戻れるよう、画面下に常時固定表示する。
// 上部の折りたたみ式メニューと違って隠れないため、これが実質「素早く戻る」ための本体になる。
function QuickAccessBar() {
  return (
    <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface/95 shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.15)] backdrop-blur">
      <div className="mx-auto flex max-w-4xl items-center gap-1.5 overflow-x-auto px-3 py-2.5 text-xs">
        <a
          href="#top"
          className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-surface px-3 py-2 font-semibold text-foreground/60 hover:bg-brand-light hover:text-brand"
        >
          ↑ 先頭
        </a>
        <span className="h-5 shrink-0 border-l border-border" />
        {SHORTCUTS.map((s) => (
          <a
            key={s.href}
            href={s.href}
            className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-3 py-2 font-semibold text-amber-700 hover:bg-amber-100"
          >
            {s.label}
          </a>
        ))}
      </div>
    </div>
  );
}

function CalendarMockup() {
  const [region, setRegion] = useState<"kanto" | "osaka">("kanto");
  const [locationType, setLocationType] = useState<"visit" | "online">("visit");
  const guests = CALENDAR_GUESTS[region];

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
      <div className="border-b border-border bg-brand-light/40 px-5 py-3">
        <h3 className="font-bold">商談獲得後にGoogleカレンダーへ登録する内容</h3>
        <p className="mt-0.5 text-xs text-foreground/50">
          エリアと訪問方法を選ぶと、実際に入力する内容が下に表示されます
        </p>
      </div>

      <div className="flex flex-wrap gap-4 border-b border-border px-5 py-3">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-foreground/50">エリア</span>
          {(["kanto", "osaka"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRegion(r)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                region === r ? "bg-brand text-white" : "border border-border text-foreground/60 hover:bg-brand-light"
              }`}
            >
              {r === "kanto" ? "関東" : "大阪"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-foreground/50">お打ち合わせ方法</span>
          {(["visit", "online"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setLocationType(t)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                locationType === t
                  ? "bg-brand text-white"
                  : "border border-border text-foreground/60 hover:bg-brand-light"
              }`}
            >
              {t === "visit" ? "訪問" : "オンライン"}
            </button>
          ))}
        </div>
      </div>

      {/* カレンダー予定作成フォーム風の表示 */}
      <div className="mx-5 my-5 rounded-xl border border-border">
        <div className="rounded-t-xl border-b border-border bg-zinc-50 px-4 py-2 text-xs font-semibold text-foreground/50">
          予定を作成
        </div>
        <div className="space-y-4 px-4 py-4">
          <div>
            <p className="text-[11px] font-medium text-foreground/40">件名</p>
            <p className="mt-1 rounded-md border border-border bg-white px-3 py-2 text-sm font-medium">
              【訪問】病院名／ご担当者様のお名前様
            </p>
          </div>

          <div>
            <p className="text-[11px] font-medium text-foreground/40">ゲストを追加</p>
            <div className="mt-1 flex flex-wrap gap-2 rounded-md border border-border bg-white px-3 py-2">
              {guests.map((g) => (
                <span
                  key={g}
                  className="rounded-full bg-brand-light px-3 py-1 text-xs font-medium text-brand"
                >
                  {g}
                </span>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-foreground/40">
              {region === "kanto" ? "関東エリアの場合は 森・富田 を招待" : "大阪エリアの場合は 松本・松長 を招待"}
            </p>
          </div>

          <div>
            <p className="text-[11px] font-medium text-foreground/40">場所</p>
            <p className="mt-1 rounded-md border border-border bg-white px-3 py-2 text-sm">
              {locationType === "visit" ? "(医療機関の住所を入力)" : "(会議室を選択し、空いている時間帯を入力)"}
            </p>
            <p className="mt-1 text-[11px] text-foreground/40">
              {locationType === "visit"
                ? "訪問の場合は医療機関の住所をそのまま入力する"
                : "オンラインの場合は会議室を選択したうえで、空いているコマに入力する"}
            </p>
          </div>

          <div>
            <p className="text-[11px] font-medium text-foreground/40">説明</p>
            <p className="mt-1 whitespace-pre-line rounded-md border border-border bg-white px-3 py-2 text-sm text-foreground/70">
              {"カルテ情報: (クラウド／オンプレ)\n患者数: (◯名)\nその他: (聴取した特記事項があれば追記)"}
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-border px-5 py-3 text-xs text-foreground/50">
        件名は「【訪問】病院名／ご担当者様のお名前様」の形式で統一する。オンラインの場合も件名の書式は同じでよい。
      </div>
    </div>
  );
}

export default function TalkScriptPage() {
  const [step1Region, setStep1Region] = useState<"kanto" | "osaka">("kanto");

  const navLinks = useMemo(
    () => [
      { id: "flow", label: "全体の流れ" },
      { id: "step0", label: "STEP0" },
      { id: "step1", label: "STEP1 受付突破" },
      { id: "step2", label: "STEP2 切り返し" },
      { id: "step3-4", label: "STEP3-4 アポ獲得" },
      { id: "calendar", label: "商談獲得後" },
      { id: "company", label: "会社情報・実績" },
    ],
    [],
  );

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-10 pb-24">
      <div id="top" className="scroll-mt-24">
        <h1 className="text-2xl font-bold">トークスクリプト</h1>
        <p className="mt-2 text-sm text-foreground/60">
          テレアポの受付突破から商談、商談獲得後のカレンダー登録までの一連の流れをまとめています。架電中はSTEP1・STEP2の枠内をそのまま読み上げてください。
        </p>
        <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          このページには個人の緊急連絡先(携帯番号)が含まれます。社外秘情報のため、スクリーンショットの共有や外部への転載は行わないでください。
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-surface px-3 py-2.5 text-xs shadow-sm">
        <span className="mr-1 shrink-0 text-[11px] font-semibold text-foreground/40">ステップで進む:</span>
        {navLinks.map((l) => (
          <a
            key={l.id}
            href={`#${l.id}`}
            className="rounded-full px-3 py-1.5 font-medium text-foreground/60 transition hover:bg-brand-light hover:text-brand"
          >
            {l.label}
          </a>
        ))}
      </div>

      {/* 全体の流れ */}
      <section className="flex flex-col gap-4">
        <SectionHeading id="flow" eyebrow="OVERVIEW" title="テレアポ→商談→商談獲得後の全体の流れ" />
        <p className="text-xs text-foreground/50">各カードをクリックすると、その内容まで直接ジャンプします。</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {FLOW_STEPS.map((s, i) => (
            <a
              key={`${s.step}-${i}`}
              href={`#${s.id}`}
              className="relative rounded-xl border border-border bg-surface p-4 shadow-sm transition hover:border-brand/40 hover:bg-brand-light/40"
            >
              <span className="inline-block rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-bold text-white">
                {s.step}
              </span>
              <p className="mt-2 text-sm font-bold">{s.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-foreground/50">{s.desc}</p>
              {i < FLOW_STEPS.length - 1 && (
                <span className="absolute -right-2.5 top-1/2 hidden -translate-y-1/2 text-lg text-foreground/20 lg:block">
                  →
                </span>
              )}
            </a>
          ))}
        </div>
      </section>

      {/* STEP0 */}
      <section className="flex flex-col gap-3">
        <SectionHeading id="step0" eyebrow="STEP0" title="架電前の確認" />
        <ul className="list-disc space-y-1 rounded-xl border border-border bg-surface p-5 pl-9 text-sm text-foreground/80 shadow-sm">
          <li>担当エリアが関東か大阪かを確認する(拠点・緊急連絡先が異なるため)</li>
          <li>架電履歴の有無を管理表で確認する(3ヶ月以内の履歴があれば専用トークを使う)</li>
        </ul>
        <StepFooterNav links={[{ href: "#step1", label: "次へ: STEP1 受付・新規案内" }]} />
      </section>

      {/* STEP1 */}
      <section className="flex flex-col gap-3">
        <SectionHeading id="step1" eyebrow="STEP1" title="受付・新規案内" />
        <div className="flex gap-2">
          {(["kanto", "osaka"] as const).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setStep1Region(r)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                step1Region === r ? "bg-brand text-white" : "border border-border text-foreground/60 hover:bg-brand-light"
              }`}
            >
              {r === "kanto" ? "関東エリア" : "大阪エリア"}
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div>
            <LabelLine>① まだ架電履歴がない場合</LabelLine>
            {step1Region === "kanto" ? (
              <div className="mt-2 flex flex-col gap-2">
                <ScriptBox>
                  「お世話になります。オンコールの◯◯と申します。弊社は夜間休日の往診代行をしておりまして、◯◯区の対応を強化しておりますので、ご挨拶させていただきたいのですが、在宅医療のご担当者様はいらっしゃいますか。」
                </ScriptBox>
                <NoteLine>↑ 対象:新拠点開設エリア以外(エリア対応強化パターン)</NoteLine>
                <ScriptBox>
                  「お世話になります。オンコールの◯◯と申します。弊社は夜間休日の往診代行をしておりまして、このたび◯◯(拠点名・地域名)に新拠点を開設いたしましたため、ご挨拶のご連絡をさせていただきました。在宅医療のご担当者様はいらっしゃいますか。」
                </ScriptBox>
                <NoteLine>
                  ↑ 対象:新拠点が開設されたエリア(2026年8月時点。「墨田区」パターンの対象区:足立区、江戸川区、葛飾区、江東区、中央区、台東区、荒川区。「国分寺市」パターンの対象:国分寺市。上記以外は「エリア対応強化」パターンを使用)
                </NoteLine>
              </div>
            ) : (
              <ScriptBox>
                「弊社は夜間休日の往診代行をしておりまして、大阪の◯◯市は対応エリアではなかったのですが、4月から本格的に対応が可能になりましてご挨拶させていただきたくご連絡差し上げました。在宅医療のご担当者様いらっしゃいますか。」
              </ScriptBox>
            )}
          </div>

          <div>
            <LabelLine>② 架電履歴がある場合(3ヶ月以内)</LabelLine>
            <div className="mt-2 flex flex-col gap-2">
              <ScriptBox>「夜間休日の往診対応の件でご連絡しましたが、在宅医療のご担当者様いらっしゃいますか。」</ScriptBox>
              <ScriptBox>
                「診療報酬改定に伴い、弊社の対応方法や料金形態に変更がありましたので、在宅医療のご担当者様にご挨拶させていただきたいのですが、よろしいでしょうか。」
              </ScriptBox>
            </div>
          </div>

          <div>
            <LabelLine>③「どこから来るの？」と聞かれた場合</LabelLine>
            <div className="mt-2">
              <ScriptBox>「{step1Region === "kanto" ? KANTO_OFFICES_NOTE : OSAKA_OFFICE_NOTE}」</ScriptBox>
              <NoteLine>
                {step1Region === "kanto"
                  ? "拠点(参考・聞かれたら):新宿事業所／墨田事業所(千葉方面担当)／国分寺事業所／横浜事業所／伊勢原事業所／埼玉事業所"
                  : "拠点(参考):大阪事業所(2026年1月開設・中央区本町2-4-12)、対応エリアは大阪全域(一部尼崎も対応)"}
              </NoteLine>
            </div>
          </div>

          <div>
            <LabelLine>④ アポ確定時の緊急連絡先案内</LabelLine>
            <div className="mt-2">
              <ScriptBox>
                「当日何かございましたら、
                {EMERGENCY_CONTACTS[step1Region].map((c) => `${c.name}${c.tel}`).join("、または")}
                までご連絡ください。」
              </ScriptBox>
              <p className="mt-1 rounded-md bg-amber-50 px-3 py-1.5 text-[11px] text-amber-700">
                個人の携帯番号です。案内は必要な場面に限り、取り扱いに注意してください。
              </p>
            </div>
          </div>
        </div>
        <StepFooterNav
          links={[
            { href: "#step3-4", label: "担当者に繋がったら: STEP3へ" },
            { href: "#step2", label: "断られたら: 切り返し集へ", variant: "secondary" },
          ]}
        />
      </section>

      {/* STEP2 */}
      <section className="flex flex-col gap-3">
        <SectionHeading id="step2" eyebrow="STEP2" title="断り文句への切り返し(共通)" />
        <p className="text-xs text-foreground/50">
          相手の反応を聞いたら、該当する項目を開いて切り返しをそのまま読んでください。▶は分岐、↓は相手の反応を受けた後の続きです。
        </p>
        <div className="flex flex-col gap-2">
          {OBJECTIONS.map((o) => (
            <details
              key={o.no}
              className="group rounded-xl border border-border bg-surface shadow-sm open:shadow-md"
            >
              <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-3 text-sm font-semibold">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-light text-xs font-bold text-brand">
                  {o.no}
                </span>
                相手:{o.situation}
                <span className="ml-auto text-foreground/30 transition group-open:rotate-180">▾</span>
              </summary>
              <div className="flex flex-col gap-2 border-t border-border px-5 py-4">
                {o.lines.map((line, idx) => {
                  if (line.kind === "script") {
                    return (
                      <ScriptBox key={idx} indent={line.indent}>
                        「{line.text}」
                      </ScriptBox>
                    );
                  }
                  if (line.kind === "label") {
                    return <LabelLine key={idx}>{line.text}</LabelLine>;
                  }
                  return <NoteLine key={idx}>{line.text}</NoteLine>;
                })}
              </div>
            </details>
          ))}
        </div>
        <StepFooterNav links={[{ href: "#step3-4", label: "担当者に繋がったら: STEP3へ" }]} />
      </section>

      {/* STEP3-4 */}
      <section className="flex flex-col gap-4">
        <SectionHeading id="step3-4" eyebrow="STEP3-4" title="担当者接続後トーク〜アポ獲得時のヒアリング" />

        <div className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-sm font-bold">STEP3｜担当者接続後トーク</p>
          <div className="mt-3 flex flex-col gap-3">
            <div>
              <LabelLine>① 基本パターン</LabelLine>
              <ScriptBox>
                「お世話になります。オンコールの◯◯と申します。弊社は、夜間休日の往診代行、オンコール代行をしておりまして、診療報酬の件も兼ねてぜひ一度ご説明させていただきたく存じますが、来週あたり30分ほどご都合はいかがでしょうか？」
              </ScriptBox>
              <NoteLine>お昼か診療時間外を提案する。</NoteLine>
            </div>
            <div>
              <LabelLine>② 貴院エリアの対応強化を伝えるパターン</LabelLine>
              <ScriptBox>
                「お世話になります。オンコールの◯◯と申します。弊社は、夜間休日の往診代行をしておりまして、貴院のエリアの対応強化をしておりまして、サービスの内容をご説明させていただければと思うのですが、来週あたり30分ほどご都合はいかがですか？」
              </ScriptBox>
            </div>
            <div>
              <LabelLine>③ 架電履歴がある場合のパターン</LabelLine>
              <ScriptBox>
                「お世話になります。オンコールの◯◯と申します。診療報酬改定に伴い、弊社の対応方法や料金形態に変更がありましたので、ご連絡差し上げました。来週あたり30分ほどご都合はいかがですか？」
              </ScriptBox>
            </div>
            <div>
              <LabelLine>④ 断られた場合の再打診</LabelLine>
              <ScriptBox>
                「診療報酬改定の方針も定まりましたので、当日弊社の方針も含めてご説明させていただければと思います。診療報酬改定の他社比較もかねてお打ち合わせさせていただければと思いますが、来週いかがでしょうか。システムで完結できる仕組みになっておりますので、当日ご説明いたします。」
              </ScriptBox>
            </div>
            <div>
              <LabelLine>⑤ 詳しく聞かれた場合(診療報酬改定・3点)</LabelLine>
              <ScriptBox>
                「①事前医師採用システムの構築、②シフト表の開示、③対話機能(日々の申し送りが可能)の3点がございます。出動時に貴院が採用した医師が対応している状態を構築できるため、施設基準を落とさず運用できます。」
              </ScriptBox>
            </div>
          </div>
        </div>

        <div id="step4" className="scroll-mt-24 rounded-xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-sm font-bold">STEP4｜アポ獲得時のヒアリング(必ず全項目を確認)</p>
          <div className="mt-3 flex flex-col gap-2">
            <ScriptBox>「お打ち合わせのお時間をいただきありがとうございます。お打ち合わせにあたって、訪問でもよろしいですか。」</ScriptBox>
            <LabelLine>▶「はい(訪問)」の場合↓</LabelLine>
            <ScriptBox indent>「では訪問させていただきますが、医療機関様のご住所でよろしいですか。」→住所を確認する</ScriptBox>
            <LabelLine>▶「オンライン希望」の場合↓</LabelLine>
            <ScriptBox indent>
              「では、URLをお送りいたしますので、メールアドレスをお伺いしてもよろしいですか。」→メールアドレスを伺い、復唱して確認する
            </ScriptBox>
          </div>

          <p className="mt-4 text-sm font-semibold">共通ヒアリング項目(必ず全項目を確認)</p>
          <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-foreground/80">
            {HEARING_ITEMS.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
          <NoteLine>資料送付を打診する場合はメールアドレス・お名前・部署役職を聴取する(FAX不可、郵送は基本お断りする)。</NoteLine>

          <div className="mt-4 flex flex-col gap-2">
            <LabelLine>最後に、ご担当者様のお名前を確認する</LabelLine>
            <ScriptBox>「ご担当者様のお名前をお伺いしてもよろしいですか。」→(復唱)「◯◯様ですね。」</ScriptBox>
            <LabelLine>クロージング</LabelLine>
            <ScriptBox>
              「お忙しい中、お電話でご対応いただきありがとうございます。◯月◯日のお打ち合わせ、よろしくお願いいたします。失礼いたします。」
            </ScriptBox>
          </div>
        </div>
        <StepFooterNav
          links={[
            { href: "#calendar", label: "アポ獲得できたら: カレンダー登録へ" },
            { href: "#pricing", label: "料金を聞かれたら", variant: "secondary" },
            { href: "#offices", label: "事業所を聞かれたら", variant: "secondary" },
          ]}
        />
      </section>

      {/* 商談獲得後 */}
      <section className="flex flex-col gap-3">
        <SectionHeading id="calendar" eyebrow="商談獲得後" title="アポ・商談獲得後のカレンダー登録" />
        <CalendarMockup />
        <StepFooterNav links={[{ href: "#company", label: "会社情報・実績を見る" }]} />
      </section>

      {/* 会社情報・実績 */}
      <section className="flex flex-col gap-4">
        <SectionHeading id="company" eyebrow="COMPANY" title="会社情報・実績(提案資料より)" />

        <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
          <div className="relative h-40 w-full sm:h-52">
            <Image src="/talk-script/team.jpg" alt="ON CALLメンバー" fill className="object-cover" />
          </div>
          <div className="grid grid-cols-1 gap-x-6 gap-y-2 p-5 text-sm sm:grid-cols-2">
            <p>
              <span className="font-semibold text-foreground/50">社名　</span>株式会社on call
            </p>
            <p>
              <span className="font-semibold text-foreground/50">代表者　</span>代表取締役 符 毅欣
            </p>
            <p className="sm:col-span-2">
              <span className="font-semibold text-foreground/50">所在地　</span>東京都中央区日本橋小伝馬町 15-18 フジノビル5F
            </p>
            <p className="sm:col-span-2">
              <span className="font-semibold text-foreground/50">事業内容　</span>
              在宅医療プラットフォーム「ON CALL」の運営、有料職業紹介事業(許可番号13-ユ-313849)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            <div className="relative h-44 w-full">
              <Image src="/talk-script/ceo.jpg" alt="代表取締役CEO 符毅欣" fill className="object-cover" />
            </div>
            <p className="px-4 py-3 text-xs text-foreground/60">代表取締役CEO / M.D.　符 毅欣</p>
          </div>
          <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
            <div className="relative h-44 w-full">
              <Image src="/talk-script/coo.jpg" alt="取締役CMO/COO 中溝祐介" fill className="object-cover" />
            </div>
            <p className="px-4 py-3 text-xs text-foreground/60">取締役CMO / COO　中溝 祐介</p>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-sm font-bold">対応3原則</p>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-lg bg-brand-light/50 p-3">
              <p className="text-xs font-bold text-brand">01 積極往診</p>
              <p className="mt-1 text-xs text-foreground/60">「往診にお伺いしましょうか？」と声掛けを徹底し、患者様の意向を優先する</p>
            </div>
            <div className="rounded-lg bg-brand-light/50 p-3">
              <p className="text-xs font-bold text-brand">02 スピード往診</p>
              <p className="mt-1 text-xs text-foreground/60">各事業所に待機列2〜3列を用意し、他社より往診開始時間を30〜60%削減</p>
            </div>
            <div className="rounded-lg bg-brand-light/50 p-3">
              <p className="text-xs font-bold text-brand">03 寄り添い往診</p>
              <p className="mt-1 text-xs text-foreground/60">医師とディレクター2名体制でフォローを徹底し、クレーム率0.04%</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-sm font-bold">ON CALLの強み(オンコール体制)</p>
          <div className="mt-3 flex flex-col gap-3">
            {STRENGTHS.map((s) => (
              <div key={s.role} className="rounded-lg border border-border p-3">
                <span className="inline-block rounded-full bg-brand px-2.5 py-0.5 text-[11px] font-bold text-white">
                  {s.role}
                </span>
                <p className="mt-1.5 text-sm font-semibold">
                  {s.role}は、<span className="bg-amber-100">{s.title}</span>
                </p>
                <p className="mt-1 text-xs leading-relaxed text-foreground/60">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-sm font-bold">実績(切り返しの裏付けとして使う場合)</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "対応件数", value: "70,000件以上" },
              { label: "大規模クリニック利用率", value: "11.29%" },
              { label: "医師会様との連携数", value: "業界トップシェア" },
              { label: "往診時のクレーム率", value: "0.04%" },
            ].map((stat) => (
              <div key={stat.label} className="rounded-lg border border-border p-3 text-center">
                <p className="text-lg font-bold text-brand">{stat.value}</p>
                <p className="mt-1 text-[11px] text-foreground/50">{stat.label}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[11px] text-foreground/40">
            メディア掲載実績: 日本経済新聞、日刊工業新聞、週刊高齢者住宅新聞、日本医事新報社 等(2023〜2024年掲載)。数値を伝える際は最新情報を上長に確認したうえで案内する。
          </p>
        </div>

        <div id="offices" className="scroll-mt-24 rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-sm font-bold">事業所一覧</p>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {OFFICES.map((o) => (
              <div key={o.name} className="rounded-lg border border-border p-3">
                <p className="text-sm font-semibold">{o.name}</p>
                <p className="mt-0.5 text-xs text-foreground/60">{o.address}</p>
                {o.note && <p className="mt-0.5 text-[11px] text-brand">{o.note}</p>}
              </div>
            ))}
          </div>
        </div>

        <div id="pricing" className="scroll-mt-24 rounded-2xl border border-border bg-surface p-5 shadow-sm">
          <p className="text-sm font-bold">料金プラン</p>
          <p className="mt-1 text-[11px] text-foreground/40">
            料金は「ON CALL基本料金(下記プラン)」+「医師給与(往診1件ごと)」の合計。金額の断定はせず、正式なお見積りは打ち合わせで案内する。
          </p>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs font-bold text-brand">ファーストコールプラン(基本料金/月)</p>
              <div className="mt-2 flex flex-col gap-1.5">
                {FIRST_CALL_PLAN.map((p) => (
                  <div key={p.label} className="flex items-center justify-between text-xs">
                    <span className="text-foreground/60">{p.label}</span>
                    <span className="font-semibold">{p.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border p-3">
              <p className="text-xs font-bold text-brand">セカンドコールプラン(チケット制)</p>
              <div className="mt-2 flex flex-col gap-1.5">
                {SECOND_CALL_TICKET_PLAN.map((p) => (
                  <div key={p.label} className="flex items-center justify-between text-xs">
                    <span className="text-foreground/60">{p.label}</span>
                    <span className="font-semibold">{p.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border p-3">
              <p className="text-xs font-bold text-brand">セカンドコールプラン(スポット制)</p>
              <div className="mt-2 flex flex-col gap-1.5">
                {SECOND_CALL_SPOT_PLAN.map((p) => (
                  <div key={p.label} className="flex items-center justify-between text-xs">
                    <span className="text-foreground/60">{p.label}</span>
                    <span className="font-semibold">{p.value}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-lg border border-border p-3">
              <p className="text-xs font-bold text-brand">医師給与(医療機関様ご負担・往診ごと)</p>
              <div className="mt-2 flex flex-col gap-1.5">
                {DOCTOR_FEE_PLAN.map((p) => (
                  <div key={p.label} className="flex items-center justify-between text-xs">
                    <span className="text-foreground/60">{p.label}</span>
                    <span className="font-semibold">{p.value}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[11px] text-foreground/40">
                別途人材紹介料として医師給与の10%、給与の振込代行代として対応した医師の人数×500円が発生します。
              </p>
            </div>
          </div>
        </div>
      </section>

      <QuickAccessBar />
    </div>
  );
}
