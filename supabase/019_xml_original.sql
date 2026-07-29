-- Guarda o texto bruto do último LandXML de Pipe Network importado (ou
-- reimportado) por revisão. O botão "Baixar XML atualizado" usa isso pra
-- editar só os campos que mudaram no app (cotas, diâmetro, declividade,
-- material, manning) dentro do arquivo original, em vez de gerar um XML do
-- zero — preserva tudo que o Civil 3D precisa e o app não edita (geometria
-- da própria estrutura via CircStruct/RectStruct, desc, etc.), sem o que o
-- reimport no Civil 3D rejeita toda estrutura como "geometria não suportada".

create table redes_xml_original (
  revisao_id uuid primary key references revisoes(id) on delete cascade,
  conteudo text not null,
  atualizado_em timestamptz default now()
);

alter table redes_xml_original enable row level security;
create policy "acesso aberto (sem login)" on redes_xml_original for all using (true) with check (true);
