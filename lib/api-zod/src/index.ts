export * from "./generated/api";
export * from "./generated/types";

// orval quirk: for operations that have both path and query parameters, the
// generated query-params TYPE is named "<Op>Params" — colliding with the zod
// path-params SCHEMA of the same name in ./generated/api. Consumers use the
// zod schema, so re-export it explicitly to resolve the star-export
// ambiguity (TS2308).
export { ListOpenaiMessagesParams } from "./generated/api";
