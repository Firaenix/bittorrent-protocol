export const wait = (ms: number) =>
  new Promise((resolve, reject) => {
    setTimeout(resolve, ms);
  });
