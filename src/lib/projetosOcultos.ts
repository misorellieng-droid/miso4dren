// Projetos cancelados e excluídos ficam ocultos nas listas e seletores, a menos
// que o usuário marque "Mostrar cancelados e excluídos". A origem é o cadastro
// central do hub (public.central_projects): `ativo = false` é excluído e
// `status = 'cancelada'` é cancelado (a view expõe como `status_central`).

export interface ProjetoComOcultacao {
  ativo?: boolean | null
  status_central?: string | null
}

export const projetoExcluido = (p: ProjetoComOcultacao): boolean => p.ativo === false

export const projetoCancelado = (p: ProjetoComOcultacao): boolean => p.status_central === 'cancelada'

export const projetoOculto = (p: ProjetoComOcultacao): boolean => projetoExcluido(p) || projetoCancelado(p)

export function filtrarProjetosVisiveis<T extends ProjetoComOcultacao>(lista: T[], mostrarOcultos: boolean): T[] {
  return mostrarOcultos ? lista : lista.filter((p) => !projetoOculto(p))
}
