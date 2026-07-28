-- Um LandXML pode trazer mais de um <PipeNetwork> (ex.: "REDE - 01",
-- "REDE - 02") que se conectam entre si — um trecho de uma rede descarrega
-- numa caixa de outra. Guarda o nome da rede de origem em cada caixa/trecho
-- pra dar pra filtrar por rede e identificar automaticamente o(s) trecho(s)
-- de conexão entre redes na tela Rede Importada.
alter table caixas add column if not exists rede_nome text;
alter table trechos add column if not exists rede_nome text;
