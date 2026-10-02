export interface PendingNote {
  readonly id: string;
  readonly text: string;
}

export interface Release {
  readonly id: string;
  readonly date: string;
  readonly notes: readonly [PendingNote, ...PendingNote[]];
}
