export function visibleFocusTarget(
  preferred: HTMLElement | null,
): HTMLElement | false {
  if (preferred?.isConnected && preferred.getClientRects().length > 0)
    return preferred;
  const navigation = document.querySelector('[aria-current="page"]');
  if (
    navigation instanceof HTMLElement &&
    navigation.getClientRects().length > 0
  )
    return navigation;
  return false;
}
