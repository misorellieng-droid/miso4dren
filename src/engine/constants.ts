/**
 * Constante de conversão do método racional: Q(m³/s) = K · C · i(mm/h) · A(m²).
 * Usada tanto na vazão de entrada das bacias (rede.ts) quanto no comprimento
 * crítico de sarjeta (sarjeta/comprimentoCritico.ts) — mesma conversão de
 * unidades, um único lugar pra manter consistente.
 */
export const RATIONAL_METHOD_K = 2.78e-7
