import { PageHeader } from "@/components/layout/PageHeader"
import { DataUpload } from "@/components/upload/DataUpload"
import { SectionCard } from "@/components/dashboard/SectionCard"
import { ingestFabric } from "@/data/upload"
import { useAppStore } from "@/store/useAppStore"

export function FabricAnalysis() {
  const rows = useAppStore((state) => state.fabricAnalysis)
  return <section className="min-w-0 space-y-6">
    <PageHeader title="FABRIC ANALYSIS" subtitle="원단분석 export 파일 기준 현황입니다." actions={<DataUpload kind="fabric-analysis" label="원단분석 업로드" accept=".xlsx,.xls,.csv" compact onFiles={(files) => { if (files[0]) void ingestFabric(files[0]) }} />} />
    {!rows.length
      ? <SectionCard title="원단분석 현황" subtitle="아직 데이터가 없습니다."><p className="text-sm text-[var(--muted-foreground)]">SETTING에서 원단분석 export 파일을 업로드하면 현황이 표시됩니다.</p></SectionCard>
      : <SectionCard title="원단분석 현황" subtitle={`업로드 데이터 ${rows.length.toLocaleString("ko-KR")}건`}><p className="text-sm text-[var(--muted-foreground)]">원단분석 데이터가 캐시에 저장되어 HOME 업무 현황에 반영됩니다.</p></SectionCard>}
  </section>
}
