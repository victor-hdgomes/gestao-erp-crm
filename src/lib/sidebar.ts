/**
 * Mora em um módulo neutro de propósito: o layout é server e o shell é client,
 * e uma constante exportada de um arquivo "use client" chega ao servidor como
 * referência de módulo, não como a string.
 */
export const SIDEBAR_COOKIE = "sidebar_collapsed";
