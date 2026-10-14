export const lastQuestion = (answer: string): string | undefined => {
  const finalParagraph = answer.trim().split(/\n\s*\n/).pop() ?? ''
  const questions = finalParagraph
    .replace(/[*_`]/g, '')
    .match(/[^.!?\n]*\?/g)
  const question = questions?.at(-1)?.replace(/^[\s>\-\d.)]+/, '').trim()

  return question ? question.slice(0, 200) : undefined
}
