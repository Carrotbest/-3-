import { useEffect, useState } from "react"
import { Save } from "lucide-react"

import { SectionCard } from "@/components/dashboard/SectionCard"
import { PageHeader } from "@/components/layout/PageHeader"
import { AuditLogPanel } from "@/components/settings/AuditLogPanel"
import { DataProtectionPanel } from "@/components/settings/DataProtectionPanel"
import { UserApprovalPanel } from "@/components/settings/UserApprovalPanel"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { currentUserIsOwner } from "@/data/auth"
import { loadTeamsWebhook, saveTeamsWebhook } from "@/data/teams-notify"

/**
 * SETTING(R241). 실제로 동작하는 것만 둔다. 사용자와 권한, 데이터 보호, 작업 이력, 연동.
 *
 * 엑셀 업로드는 쓰지 않는다(2026-09-22). 파일 연결 센터, DD 비상용 업로드, 샘플대장 업로드를 없앴다.
 * 예전 기준값, 알림 규칙, 사용자 권한 드롭다운, 팀 계층, 변경 이력은 이 브라우저(localStorage)에만 저장되고
 * 어느 화면도 읽지 않던 카드라 함께 뺐다. 새로 만들 때는 서버에 저장하고 실제로 읽는 곳이 있어야 한다.
 */
export function Setting() {
  const isOwner = currentUserIsOwner()
  const [teamsWebhook, setTeamsWebhook] = useState("")
  const [teamsWebhookSaving, setTeamsWebhookSaving] = useState(false)
  const [teamsMessage, setTeamsMessage] = useState("")

  useEffect(() => {
    if (!isOwner) return
    void loadTeamsWebhook()
      .then(setTeamsWebhook)
      .catch(() => setTeamsMessage("Teams 알림 주소를 불러오지 못했습니다."))
  }, [isOwner])

  const saveWebhook = async () => {
    setTeamsWebhookSaving(true)
    try {
      const savedUrl = await saveTeamsWebhook(teamsWebhook)
      setTeamsWebhook(savedUrl)
      setTeamsMessage(teamsWebhook.trim() && !savedUrl
        ? "HTTPS 주소만 저장할 수 있어 Teams 알림을 껐습니다."
        : "Teams 알림 설정을 저장했습니다.")
    } catch {
      setTeamsMessage("Teams 알림 설정을 저장하지 못했습니다.")
    } finally {
      setTeamsWebhookSaving(false)
    }
  }

  return (
    <section className="min-w-0 space-y-6">
      <PageHeader
        title="SETTING"
        subtitle="사용자 권한, 데이터 보호, 작업 이력, 연동을 관리합니다. 엑셀 업로드는 쓰지 않습니다."
      />

      <Tabs defaultValue="users" className="min-w-0">
        <TabsList aria-label="SETTING 메뉴">
          <TabsTrigger value="users">사용자와 권한</TabsTrigger>
          <TabsTrigger value="data">데이터 보호</TabsTrigger>
          <TabsTrigger value="history">작업 이력</TabsTrigger>
          <TabsTrigger value="integrations">연동</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-6 space-y-4">
          <UserApprovalPanel />
        </TabsContent>

        <TabsContent value="data" className="mt-6">
          <DataProtectionPanel isOwner={isOwner} />
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <AuditLogPanel />
        </TabsContent>

        <TabsContent value="integrations" className="mt-6 space-y-4">
          {isOwner ? <SectionCard title="Teams 알림" subtitle="창고 입고 등록과 출고 요청을 Teams 채널에 알립니다. 비우면 알림을 보내지 않습니다.">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1">
                <Label htmlFor="teams-webhook">워크플로 주소</Label>
                <Input id="teams-webhook" type="url" className="mt-2" value={teamsWebhook} onChange={(event) => setTeamsWebhook(event.target.value)} placeholder="https://" autoComplete="off" />
              </div>
              <Button type="button" disabled={teamsWebhookSaving} onClick={() => void saveWebhook()}><Save aria-hidden="true" />{teamsWebhookSaving ? "저장 중" : "저장"}</Button>
            </div>
            {teamsMessage ? <p aria-live="polite" className="mt-3 text-xs text-[var(--foreground)]">{teamsMessage}</p> : null}
          </SectionCard> : <p className="text-sm text-[var(--muted-foreground)]">연동 설정은 소유자만 바꿀 수 있습니다.</p>}
        </TabsContent>
      </Tabs>
    </section>
  )
}
