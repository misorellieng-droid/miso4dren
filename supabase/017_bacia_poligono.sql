-- Importação de bacias por Parcel (LandXML) em vez de só o ponto de descarga
-- (CSV): guarda o contorno completo da bacia pra detectar automaticamente
-- quais caixas estão fisicamente dentro dela (ponto-em-polígono), em vez de
-- só a caixa mais próxima do pour point. O Parcel do Civil 3D não traz
-- coeficiente de escoamento — coef_c passa a ser opcional na importação e
-- editável manualmente na tela.

alter table bacias alter column coef_c drop not null;
alter table bacias add column if not exists poligono jsonb;
