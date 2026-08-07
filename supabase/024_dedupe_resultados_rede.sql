-- saveResultadoRede sempre fez um INSERT puro (nunca upsert), e o "Rodar cálculo da rede"
-- roda um loop sequencial de ~1 insert por trecho (pode levar vários segundos numa rede
-- grande) sem nenhum lock contra chamadas concorrentes -- clicar duas vezes rápido (ou editar
-- um trecho na memória de cálculo enquanto outro recálculo ainda estava rodando) disparava
-- duas execuções sobrepostas, cada uma com seu próprio delete-então-insert, e dependendo do
-- timing da corrida alguns trechos acabavam com DUAS linhas de resultado em vez de uma.

-- Remove as duplicatas já existentes, mantendo só a linha mais recente de cada trecho
-- (empate de created_at resolvido pelo id, só pra ser determinístico).
delete from resultados_rede a
using resultados_rede b
where a.trecho_id = b.trecho_id
  and (a.created_at, a.id) < (b.created_at, b.id);

-- Impede que a duplicata volte a acontecer, mesmo que uma corrida escape do lock adicionado
-- no app (RedePluvialPage.tsx agora serializa as chamadas de cálculo) -- combinado com o
-- upsert em saveResultadoRede (resultadosStorage.ts), uma segunda gravação do mesmo trecho
-- substitui a primeira em vez de duplicar.
alter table resultados_rede add constraint resultados_rede_trecho_id_key unique (trecho_id);
