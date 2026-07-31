export interface ParametrosEscavacao {
  larguraFundoM: number
  taludeHv: number
  alturaBercoM: number
}

export interface VolumesTrecho {
  volumeEscavacaoM3: number
  volumeBercoM3: number
  volumeReaterroM3: number
}

/**
 * Área da seção transversal da vala numa extremidade — trapézio com largura fixa no FUNDO
 * (nível do berço) e talude H:V alargando pra cima: A = largura_fundo × H + talude × H²
 * (cada lado alarga talude×H, dois lados = talude×H² de área extra dos dois triângulos).
 */
export function areaSecaoValaM2(profundidadeM: number, larguraFundoM: number, taludeHv: number): number {
  const h = Math.max(profundidadeM, 0)
  return larguraFundoM * h + taludeHv * h * h
}

/**
 * Volume de escavação de um trecho pelo método da área média (seção trapezoidal em cada
 * extremidade, área média × comprimento — padrão em movimento de terra). A profundidade em
 * cada extremidade é contada da cota de terreno até o FUNDO DO BERÇO (abaixo do tubo), não
 * até o fundo do tubo em si, já que o berço também é escavado.
 */
export function calcularVolumeEscavacaoM3(
  comprimentoM: number,
  cotaTerrenoMontanteM: number,
  cotaFundoTuboMontanteM: number,
  cotaTerrenoJusanteM: number,
  cotaFundoTuboJusanteM: number,
  params: ParametrosEscavacao
): number {
  const profundidadeMontante = cotaTerrenoMontanteM - (cotaFundoTuboMontanteM - params.alturaBercoM)
  const profundidadeJusante = cotaTerrenoJusanteM - (cotaFundoTuboJusanteM - params.alturaBercoM)
  const areaMontante = areaSecaoValaM2(profundidadeMontante, params.larguraFundoM, params.taludeHv)
  const areaJusante = areaSecaoValaM2(profundidadeJusante, params.larguraFundoM, params.taludeHv)
  return ((areaMontante + areaJusante) / 2) * comprimentoM
}

/**
 * Volume da camada de berço (lastro) abaixo do tubo — também é vala escavada com talude, então
 * a seção nessa faixa de altura já alarga em relação à largura do fundo (mesma fórmula
 * trapezoidal da escavação, só que com H = altura do berço em vez da profundidade total).
 * Como a altura do berço é constante ao longo do trecho, a seção não varia entre as pontas —
 * não precisa de área média.
 */
export function calcularVolumeBercoM3(comprimentoM: number, params: ParametrosEscavacao): number {
  return areaSecaoValaM2(params.alturaBercoM, params.larguraFundoM, params.taludeHv) * comprimentoM
}

/** Volume ocupado pelo tubo (diâmetro externo = interno + 2× espessura de parede), pra descontar do reaterro. */
export function calcularVolumeTuboM3(comprimentoM: number, diametroExternoM: number): number {
  return (Math.PI / 4) * diametroExternoM * diametroExternoM * comprimentoM
}

/** Material de reaterro = o que sobra depois de tirar o berço e o próprio tubo do volume escavado. */
export function calcularVolumeReaterroM3(volumeEscavacaoM3: number, volumeBercoM3: number, volumeTuboM3: number): number {
  return Math.max(volumeEscavacaoM3 - volumeBercoM3 - volumeTuboM3, 0)
}

export function calcularVolumesTrecho(
  comprimentoM: number,
  cotaTerrenoMontanteM: number,
  cotaFundoTuboMontanteM: number,
  cotaTerrenoJusanteM: number,
  cotaFundoTuboJusanteM: number,
  diametroExternoM: number,
  params: ParametrosEscavacao
): VolumesTrecho {
  const volumeEscavacaoM3 = calcularVolumeEscavacaoM3(
    comprimentoM,
    cotaTerrenoMontanteM,
    cotaFundoTuboMontanteM,
    cotaTerrenoJusanteM,
    cotaFundoTuboJusanteM,
    params
  )
  const volumeBercoM3 = calcularVolumeBercoM3(comprimentoM, params)
  const volumeTuboM3 = calcularVolumeTuboM3(comprimentoM, diametroExternoM)
  const volumeReaterroM3 = calcularVolumeReaterroM3(volumeEscavacaoM3, volumeBercoM3, volumeTuboM3)
  return { volumeEscavacaoM3, volumeBercoM3, volumeReaterroM3 }
}
