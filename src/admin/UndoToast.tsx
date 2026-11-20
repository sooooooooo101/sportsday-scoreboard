import type { SaveErrorKind, SaveStatus } from './useSave'

export const REJECTED_TEXT = '保存できませんでした。満点を超えたか、ほかの端末の入力と重なりました。最新の点数を確認してください'

const TEXT: Record<Exclude<SaveStatus, 'idle'>, string> = {
  saving: '保存中…',
  // The centered popup confirms the save; this bar just offers undo.
  saved: '入力を取り消せます',
  unsent: '未送信：通信を確認してください',
  error: '保存できませんでした。通信を確認してもう一度押してください',
}

type Props = { status: SaveStatus; errorKind: SaveErrorKind; canUndo: boolean; onUndo: () => void; onDismiss: () => void }

export function UndoToast({ status, errorKind, canUndo, onUndo, onDismiss }: Props) {
  if (status === 'idle') return null
  const problem = status === 'unsent' || status === 'error'
  return (
    <div className={`toast${problem ? ' toast--problem' : ''}`} role={problem ? 'alert' : 'status'}>
      <span>{status === 'error' && errorKind === 'rejected' ? REJECTED_TEXT : TEXT[status]}</span>
      {status === 'saved' && canUndo && <button className="toast__undo" type="button" onClick={onUndo}>取り消す</button>}
      {status === 'error' && <button className="toast__undo" type="button" onClick={onDismiss}>閉じる</button>}
    </div>
  )
}
