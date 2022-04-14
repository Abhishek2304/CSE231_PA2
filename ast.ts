export type Type =
  | "int"
  | "none"
  | "bool"

export type Parameter = 
| { name: string, typ: Type }

export type Stmt =
  | { tag: "assign", name: string, value: Expr }
  | { tag: "define", name: string, parameters: Array<Parameter>, ret: Type, body: Array<Stmt> }
  | { tag: "expr", expr: Expr }
  | { tag: "while", cond: Expr, body: Array<Stmt>}
  | { tag: "pass"}
  | { tag: "return", value: Expr}
  | { tag: "if", cond: Expr, thn: Array<Stmt>, els: Array<Stmt>}  

export type Expr = 
  | { tag: "literal", value: Literal }
  | { tag: "id", name: string }
  | { tag: "call", name: string, arguments: Array<Expr> }
  | { tag: "uniop", op: UniOp, expr: Expr}
  | { tag: "binop", op: BinOp, left: Expr, right: Expr}
  | { tag: "builtin1", name: string, arg: Expr }
  | { tag: "builtin2", name: string, arg1: Expr, arg2: Expr }


  export enum BinOp {
    Plus,
    Minus,
    Mul,
    IDiv,
    Mod,
    Eq,
    Neq,
    Lte,
    Gte,
    Lt,
    Gt,
    Is,
  }

  export enum UniOp {
    Neg,
    Not,
  }

  export type Literal =
  | {tag: "none"}
  | {tag: "bool"; value: boolean}
  | {tag: "num"; value: number};