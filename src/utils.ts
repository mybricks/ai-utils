export const replaceNonAlphaNumeric = (string: string, replaceValue: string = "_") => {
  return string.replace(/[^0-9a-zA-Z]/g, replaceValue);
}
