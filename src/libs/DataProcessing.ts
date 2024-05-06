class Base64 {
    private static readonly alphabet: string = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

    static encode(inputStr: string): string {
        const inputArray = new Uint8Array(inputStr.length);
        
        for (let i = 0; i < inputStr.length; i++) {
            inputArray[i] = inputStr.charCodeAt(i);
        }

        let encodedStr = "";
        for (let i = 0; i < inputArray.length; i += 3) {
            const triplet = inputArray[i] << 16 | (inputArray[i + 1] || 0) << 8 | (inputArray[i + 2] || 0);
            
            encodedStr += [0, 1, 2, 3].map(offset => 
                8 * i + 6 * offset <= 8 * inputArray.length ? 
                Base64.alphabet[triplet >>> 6 * (3 - offset) & 63] : "="
            ).join("");
        }
        
        return encodedStr;
    }
    
    static decode(encodedStr: string): string {
        const decodedLength = encodedStr.length / 4 * 3 - 
            ((encodedStr[encodedStr.length - 2] === "=" ? 1 : 0) + (encodedStr[encodedStr.length - 1] === "=" ? 1 : 0));
        const decodedArray = new Uint8Array(decodedLength);
        
        for (let i = 0, j = 0; i < encodedStr.length; i += 4, j += 3) {
            const quad = [...encodedStr.substring(i, i + 4)].map(char => Base64.alphabet.indexOf(char));
            const combinedValue = quad[0] << 18 | quad[1] << 12 | (quad[2] !== -1 ? quad[2] : 0) << 6 | (quad[3] !== -1 ? quad[3] : 0);
            
            decodedArray[j] = (combinedValue >> 16) & 255;
            if (quad[2] !== -1) {
                decodedArray[j + 1] = (combinedValue >> 8) & 255;
            }
            if (quad[3] !== -1) {
                decodedArray[j + 2] = combinedValue & 255;
            }
        }
        
        return String.fromCharCode(...decodedArray);
    }
}

function djb2Hash(str) {
  var hash = 5381;
  for (var i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
  }
  if (hash < 0) hash *= -1;
  return hash.toString(36);
}


export {Base64, djb2Hash};
