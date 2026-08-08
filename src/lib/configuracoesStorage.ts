import { supabase } from './supabase'

const BUCKET = 'assets'
const LOGO_PATH = 'logo'

function requireSupabase() {
  if (!supabase) throw new Error('Supabase não configurado — defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.')
  return supabase
}

/** URL pública do logotipo -- sempre o mesmo path fixo (upload novo sobrescreve o anterior, ver
 * migração 028_bucket_assets_logo.sql). Não confirma que o arquivo existe de fato, só monta a
 * URL -- use `logoExiste` pra checar antes de exibir/embutir. */
export function getLogoUrl(): string | null {
  if (!supabase) return null
  return supabase.storage.from(BUCKET).getPublicUrl(LOGO_PATH).data.publicUrl
}

/** Confirma se o logotipo foi de fato cadastrado (existe objeto no bucket nesse path) --
 * `cache: 'no-store'` pra não ficar preso num 404 antigo em cache do browser logo depois de um
 * upload novo. */
export async function logoExiste(): Promise<boolean> {
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
  const { error } = await requireSupabase()
    .storage.from(BUCKET)
    .upload(LOGO_PATH, file, { upsert: true, contentType: file.type || 'image/png' })
  if (error) throw error
}

export async function removerLogo(): Promise<void> {
  const { error } = await requireSupabase().storage.from(BUCKET).remove([LOGO_PATH])
  if (error) throw error
}
