/** diff 규모의 공통 분류. 노력량의 직접 측정값이 아니라 배정의 초기 추정치다. */
export function sizeOf(lines: number, files: number): "S" | "M" | "L" {
  return lines <= 100 ? "S" : lines <= 400 && files <= 15 ? "M" : "L"
}
