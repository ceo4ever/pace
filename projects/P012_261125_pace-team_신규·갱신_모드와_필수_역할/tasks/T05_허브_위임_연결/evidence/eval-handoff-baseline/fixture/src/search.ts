export function searchWithinAccount(account: string, query: string, documents: { id: string; account: string; title: string }[]) {
  return documents.filter(doc => doc.account === account).filter(doc => doc.title.includes(query)).slice(0, 3);
}
