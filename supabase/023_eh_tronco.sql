-- A rede tronco (filtro "Só rede tronco" em Rede Pluvial) hoje decide por diâmetro/peso
-- hidráulico em cada confluência, o que é imprevisível e às vezes pega boca de lobo que não
-- devia. Troca por um flag explícito por caixa (mesmo padrão de recebe_vazao): o parser do
-- LandXML já preenche automaticamente pelo tipo inferido (PV e boca de lobo = tronco por
-- padrão), editável depois em Cadastros → Rede Importada.
alter table caixas add column if not exists eh_tronco boolean not null default false;

-- Backfill das caixas já importadas antes dessa coluna existir.
update caixas set eh_tronco = true where tipo in ('pv', 'boca_de_lobo') and eh_tronco = false;
