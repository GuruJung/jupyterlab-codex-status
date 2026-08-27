export class LabIcon {
  constructor(options: { name: string; svgstr: string }) {
    this.name = options.name;
    this.svgstr = options.svgstr;
  }

  readonly name: string;
  readonly svgstr: string;

  bindprops(_props: object): LabIcon {
    return this;
  }
}
