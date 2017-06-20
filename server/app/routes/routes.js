
import events from '../../api/events';
import users from '../../api/user';
import auth from '../../auth';
import email from '../../api/email';
import ggcalendar from '../../api/gg-calendar';

const path = process.cwd();

export default (app) => {
  /*
  ....###....########..####..######.
  ...##.##...##.....##..##..##....##
  ..##...##..##.....##..##..##......
  .##.....##.########...##...######.
  .#########.##.........##........##
  .##.....##.##.........##..##....##
  .##.....##.##........####..######.
  */

  /* auth stuff */
  app.use('/api/auth', auth);
  /* meeetings API*/
  app.use('/api/events', events);
  /* users API */
  app.use('/api/user', users);
  /* email API */
  app.use('/api/email', email);

  app.use('/api/ggcalendar', ggcalendar);

  app.route('*')
    .get((req, res) => res.sendFile(`${path}/build/index.html`));
};
