/**
 * @fileoverview Ancla en el DOM de un elemento de la ficha.
 *
 * Vive fuera de `MediaCard.tsx` por dos motivos: exportar funciones junto a un
 * componente rompe el fast refresh de Vite, y quien salta a una card (la
 * revision de adendas) no necesita importar el componente para hacerlo.
 *
 * Que la cadena este en un solo sitio es lo que evita que un renombre deje el
 * salto apuntando a la nada sin que nada falle al compilar.
 */

export const fichaItemAnchorId = (itemId: string) => `ficha-item-${itemId}`
