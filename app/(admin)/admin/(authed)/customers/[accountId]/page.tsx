import { redirect } from "next/navigation"

export default function LegacyCompany360Redirect({ params }: { params: { accountId: string } }) {
  redirect(`/admin/accounts/${params.accountId}`)
}
