-- Hoje qualquer caixa pode ser escolhida como dispositivo de captação de
-- bacia, mesmo uma PV que só conduz tubo (não devia receber vazão de
-- superfície diretamente). Adiciona um flag explícito por caixa, que o
-- parser do LandXML já preenche automaticamente pelo tipo inferido (boca de
-- lobo = recebe vazão) e que fica editável em Cadastros → Rede Importada.
alter table caixas add column if not exists recebe_vazao boolean not null default false;

-- Backfill das caixas já importadas antes dessa coluna existir.
update caixas set recebe_vazao = true where tipo = 'boca_de_lobo' and recebe_vazao = false;
