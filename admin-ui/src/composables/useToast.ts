import { reactive } from 'vue'

export const toastState = reactive({ msg: '', bad: false, show: false })

let timer: ReturnType<typeof setTimeout> | undefined

export function toast(msg: string, bad = false): void {
  toastState.msg = msg
  toastState.bad = bad
  toastState.show = true
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    toastState.show = false
  }, 2400)
}
