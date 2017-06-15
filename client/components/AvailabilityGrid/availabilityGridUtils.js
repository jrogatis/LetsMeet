import Moment from 'moment';
import { extendMoment } from 'moment-range';
import _ from 'lodash';
import chroma from 'chroma-js';

const moment = extendMoment(Moment);

const datesMinMax = (event) => {
  let dates = _.cloneDeep(event.dates);
  dates = _.flatMap(dates, v => [v.fromDate, v.toDate]);
  dates.sort((a, b) => moment(a).isAfter(moment(b)));
  return { max: moment(dates[dates.length - 1]), min: moment(dates[0]) };
};

/**
 * creaates slots of 15 minutes for a range of availability
 * @param {*} from inicial time for that range
 * @param {*} to end time for that range
 */
const rangeForAvailability = (from, to) => {
  const datesRange = moment.range([moment(from).startOf('minute'), moment(to).startOf('minute')]);
  const quartersFromDtRange = Array.from(datesRange.by('minutes', {
    exclusive: true,
    step: 15,
  }));
  const quartersToAvail = [];
  quartersFromDtRange.forEach(date => quartersToAvail.push([moment(date).unix()]));
  return quartersToAvail;
};

export const generateRange = (num1, num2) => {
  let rangeStart;
  let rangeEnd;
  const range = [];
  if (num1 > num2) {
    rangeStart = num2;
    rangeEnd = num1;
  } else {
    rangeStart = num1;
    rangeEnd = num2;
  }
  for (let i = rangeStart; i <= rangeEnd; i += 1) {
    range.push(i);
  }
  return range;
};

const flattenedAvailabilitys = (event) => {
  const flattenedAvailability = {};
  event.participants.forEach((participant) => {
    const avail = participant.availability.map(avail =>
 _.flatten(rangeForAvailability(avail[0], avail[1])));
    flattenedAvailability[participant.userId._id] = _.flatten(avail);
  });
  return flattenedAvailability;
};

export const genHeatMapBackgroundColors = (participants) => {
  let quantOfParticipants = participants.filter(
    participant => participant.availability.length > 0).length;
  quantOfParticipants = (quantOfParticipants > 2) ? quantOfParticipants : 2;
  if (quantOfParticipants < 3) {
    return chroma.scale(['#AECDE0', '#8191CD']).colors(quantOfParticipants);
  }
  if (quantOfParticipants < 5) {
    return chroma.scale(['#AECDE0', '#5456BA']).colors(quantOfParticipants);
  }
  return chroma.scale(['#AECDE0', '#3E38B1']).colors(quantOfParticipants);
};

export const createTimesRange = (dates) => {
  // get the first to from dates from the dates range.
  // so he has the hole hours ranges
  const startDate = moment(dates[0].fromDate);
  const endDate = moment(dates[0].toDate);
  const hour = endDate.get('hour');
  const minute = endDate.get('minute');
  const endDateToRange = moment(startDate).startOf('date').hour(hour).minute(minute);
  let dateRange = moment.range(startDate, endDateToRange);
  // if the end range hour is before the start hour then ajust the range for end at next day;
  // so the range can be calculated correctly.
  if (endDateToRange.hour() < startDate.hour()) {
    dateRange = moment.range(startDate, moment(endDateToRange).add(1, 'days'));
  }
  const timesRange = Array.from(dateRange.by('minutes', { exclusive: true, step: 15 }));
  // correct the date value for each hour at the array since the
  // range maybe create dates thats goes to the next day.
  // but we whant all dates at the same day.
  const timesRangeFinal = timesRange.map(time => moment(startDate).startOf('date').hour(time.get('hour')).minute(time.get('minute')));
  timesRangeFinal.sort((a, b) => a.clone().unix() - b.clone().unix());
  return timesRangeFinal;
};

export const createDatesRange = (dates) => {
  let datesRanges = dates.map((date) => {
    const range = moment.range(moment(date.fromDate).startOf('date'), moment(date.toDate).startOf('date'));
    return Array.from(range.by('days', { step: 1 }));
  });
  datesRanges = _.flatten(datesRanges);
  datesRanges.sort((a, b) => a.clone().unix() - b.clone().unix());
  return datesRanges;
};

const createGuestNotGuestList = (participants, flattenedAvailability, dateHourForCell) => {
  const guests = [];
  const notGuests = [];
  participants.forEach((participant) => {
    const availForThatParticipant = flattenedAvailability[participant.userId._id];
    const guest = {};
    guest[participant.userId._id] = participant.userId.name;
    if (availForThatParticipant.indexOf(dateHourForCell.unix()) > -1) {
      guests.push(guest);
    } else {
      notGuests.push(guest);
    }
  });
  return { guests, notGuests };
};

const createQuartersForGrid = (allTimes, date, flattenedAvailability, dtsMinMax, participants) =>
  allTimes.map((quarter) => {
    const quarterM = moment(quarter);
    const dateHourForCell = moment(date).hour(quarterM.hour()).minute(quarterM.minute()).startOf('minute');
    if (dateHourForCell.isAfter(dtsMinMax.max) || dateHourForCell.isBefore(dtsMinMax.min)) {
      return {
        time: dateHourForCell.toDate(),
        participants: [],
        notParticipants: [],
        disable: true,
      };
    }
    const listGuests =
      createGuestNotGuestList(participants, flattenedAvailability, dateHourForCell);
    return {
      time: dateHourForCell.toDate(),
      participants: listGuests.guests,
      notParticipants: listGuests.notGuests,
    };
  });

/**
 *
 * @param {array} allDates
 * @param {array} allTimes
 * @param {Object} event
 */
export const createGridComplete = (allDates, allTimes, event) => {
  const grid = [];
  const dtsMinMax = datesMinMax(event);
  const flattenedAvailability = flattenedAvailabilitys(event);
  allDates.forEach((date) => {
    grid.push({
      date,
      quarters: createQuartersForGrid(allTimes,
        date, flattenedAvailability, dtsMinMax, event.participants),
    });
  });
  return grid;
};

/**
 *
 * @param {*} quarter
 * @param {*} operation
 * @param {*} cellRowIndex
 * @param {*} cellColumnIndex
 * @param {*} cellInitialRow
 * @param {*} cellInitialColumn
 * @param {*} curUser
 * @param {*} grid
 */
export const editParticipantToCellGrid = (
  quarter, operation,
  cellRowIndex,
  cellColumnIndex,
  cellInitialRow,
  cellInitialColumn,
  curUser, grid) => {
  const nGrid = _.cloneDeep(grid);
  const rows = generateRange(cellInitialRow, cellRowIndex);
  const columns = generateRange(cellInitialColumn, cellColumnIndex);

  rows.forEach((row) => {
    columns.forEach((cell) => {
      const nQuarter = nGrid[row].quarters[cell];
      const indexAtParticipant = _.findIndex(nQuarter.participants, curUser._id);
      const indexAtNotParticipant = _.findIndex(nQuarter.notParticipants, curUser._id);
      if (operation === 'add' && indexAtParticipant === -1) {
        if (indexAtNotParticipant > -1) {
          const temp = nQuarter.notParticipants.splice(indexAtNotParticipant, 1);
          nQuarter.participants.push(temp[0]);
        } else {
          const temp = {};
          temp[curUser._id] = curUser.name;
          nQuarter.participants.push(temp);
        }
      }
      if (operation === 'remove' && indexAtNotParticipant === -1) {
        if (indexAtParticipant > -1) {
          const temp = nQuarter.participants.splice(indexAtParticipant, 1);
          nQuarter.notParticipants.push(temp[0]);
        } else {
          const temp = {};
          temp[curUser._id] = curUser.name;
          nQuarter.notParticipants.push(temp);
        }
      }
    });
  });
  return nGrid;
};

export const availabilityReducer = (availability) => {
  // sort the array just to be sure
  const availabilityToEdit = _.cloneDeep(availability);
  availabilityToEdit.sort((a, b) => {
    const x = moment(a[0]).clone().unix();
    const y = moment(b[0]).clone().unix();
    return x - y;
  });
  const availReduced = [];
  let previousFrom = moment(availabilityToEdit[0][0]);
  let previousTo = moment(availabilityToEdit[0][0]);

  availabilityToEdit.forEach((quarter) => {
    // if the old to is the same of the current from
    // then is the same "range"
    const curFrom = moment(quarter[0]);
    const curTo = moment(quarter[1]);
    if (previousTo.isSame(curFrom)) {
      previousTo = curTo;
    } else {
      availReduced.push([previousFrom._d, previousTo._d]);
      previousFrom = curFrom;
      previousTo = curTo;
    }
  });
  // at the and save the last [from to] sinse he dosen't have
  // a pair to compare
  const to = moment(availabilityToEdit[availabilityToEdit.length - 1][1]);
  availReduced.push([previousFrom._d, to._d]);
  return _.uniqWith(availReduced, _.isEqual);
};
