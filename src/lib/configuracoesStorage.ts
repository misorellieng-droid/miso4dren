import { supabase } from './supabase'

// Bucket do dren no banco do hub: uma pasta por conta (<account_id>/logo),
// para cada empresa ter o próprio logotipo. O banco só deixa enviar/apagar
// na pasta da própria conta.
const BUCKET = 'dren-assets'

let pastaConta: string | null = null

/** Pasta da conta de quem está logado (lida uma vez do hub). */
async function carregarPastaConta(): Promise<string | null> {
  if (pastaConta || !supabase) return pastaConta
  const { data } = await supabase.schema('public').rpc('minha_conta')
  pastaConta = typeof data === 'string' ? data : null
  return pastaConta
}

function logoPath(conta: string) {
  return `${conta}/logo`
}

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  return supabase
}

/** URL pública do logotipo da conta -- sempre o mesmo path fixo (upload novo sobrescreve o
 * anterior). Não confirma que o arquivo existe de fato, só monta a URL -- use `logoExiste` pra
 * checar antes de exibir/embutir. Devolve null até a conta ter sido carregada (logoExiste,
 * carregarLogoParaPdf e uploadLogo carregam). */
export function getLogoUrl(): string | null {
  if (!supabase || !pastaConta) return null
  return supabase.storage.from(BUCKET).getPublicUrl(logoPath(pastaConta)).data.publicUrl
}

/** Confirma se o logotipo foi de fato cadastrado (existe objeto no bucket nesse path) --
 * `cache: 'no-store'` pra não ficar preso num 404 antigo em cache do browser logo depois de um
 * upload novo. */
export async function logoExiste(): Promise<boolean> {
  await carregarPastaConta()
  const url = getLogoUrl()
  if (!url) return false
  try {
    const resp = await fetch(url, { method: 'HEAD', cache: 'no-store' })
    return resp.ok
  } catch {
    return false
  }
}

export interface ImagemLogo {
  dataUrl: string
  larguraOriginal: number
  alturaOriginal: number
}

/** Carrega o logotipo cadastrado como data URL + dimensões, pronto pra `doc.addImage` no
 * relatório completo -- `null` quando não há logotipo cadastrado ou algo falha (o relatório
 * simplesmente sai sem logo nesse caso, nunca bloqueia a geração por causa disso). */
export async function carregarLogoParaPdf(): Promise<ImagemLogo | null> {
  await carregarPastaConta()
  const url = getLogoUrl()
  if (!url) return null
  try {
    const resp = await fetch(url, { cache: 'no-store' })
    if (!resp.ok) return null
    const blob = await resp.blob()
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('Falha ao ler o logotipo.'))
      reader.readAsDataURL(blob)
    })
    const dimensoes = await new Promise<{ w: number; h: number }>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve({ w: img.width, h: img.height })
      img.onerror = () => reject(new Error('Falha ao carregar o logotipo.'))
      img.src = dataUrl
    })
    return { dataUrl, larguraOriginal: dimensoes.w, alturaOriginal: dimensoes.h }
  } catch {
    return null
  }
}

export async function uploadLogo(file: File): Promise<void> {
  const conta = await carregarPastaConta()
  if (!conta) throw new Error('Conta não identificada. Abra o app pelo MISO4Apps.')
  const { error } = await requireSupabase()
    .storage.from(BUCKET)
    .upload(logoPath(conta), file, { upsert: true, contentType: file.type || 'image/png' })
  if (error) throw error
}

export async function removerLogo(): Promise<void> {
  const conta = await carregarPastaConta()
  if (!conta) throw new Error('Conta não identificada. Abra o app pelo MISO4Apps.')
  const { error } = await requireSupabase().storage.from(BUCKET).remove([logoPath(conta)])
  if (error) throw error
}
